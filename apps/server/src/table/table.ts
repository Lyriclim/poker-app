import type { Server, Socket } from 'socket.io';
import type {
  ActionType,
  HandResult,
  PlayerPublic,
  RoomPublic,
  TableView,
  WinnerInfo,
} from '@poker/shared';
import { AFK_CHECK_AFTER_MS, AFK_CHECK_RESPONSE_MS, raiseLabel } from '@poker/shared';
import { PokerGame, GameError, type EngineEvent } from '../game/engine';
import { prisma } from '../db';

interface PendingAction {
  playerId: string;
  seatIndex: number;
  action: string;
  amount: number;
  street: string;
}

interface SocketUser {
  id: string;
  username: string;
}

/**
 * 一张正在运行的牌桌：持有引擎状态，管理玩家坐席、Socket 连接、
 * 挂机检测，并在牌局结束时落库。
 */
export class Table {
  readonly id: string;
  readonly name: string;
  readonly inviteCode: string;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly maxPlayers: number;
  readonly game: PokerGame;

  private io: Server;
  private sockets = new Map<string, Set<string>>(); // userId -> socket ids
  private socketUser = new Map<string, string>(); // socketId -> userId
  private afkCheckTimer: NodeJS.Timeout | null = null;
  private afkCheckPending = false; // 是否正在等待玩家回应挂机检测
  private showdownAcks = new Set<number>();
  private lastActionText: string | null = null;
  private pendingActions: PendingAction[] = [];

  constructor(
    io: Server,
    room: { id: string; name: string; inviteCode: string; smallBlind: number; bigBlind: number; maxPlayers: number },
  ) {
    this.io = io;
    this.id = room.id;
    this.name = room.name;
    this.inviteCode = room.inviteCode;
    this.smallBlind = room.smallBlind;
    this.bigBlind = room.bigBlind;
    this.maxPlayers = room.maxPlayers;
    this.game = new PokerGame({
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      maxPlayers: room.maxPlayers,
    });
  }

  private roomName(): string {
    return `room:${this.id}`;
  }

  private findSeat(userId: string): number | null {
    return this.game.players.find((p) => p.userId === userId)?.seatIndex ?? null;
  }

  // ============ 连接管理 ============

  join(socket: Socket, user: SocketUser): void {
    socket.join(this.roomName());
    if (!this.socketUser.has(socket.id)) {
      this.socketUser.set(socket.id, user.id);
      const set = this.sockets.get(user.id) ?? new Set<string>();
      set.add(socket.id);
      this.sockets.set(user.id, set);
    }
    this.setConnected(user.id, true);
    this.sendView(socket, user.id);
  }

  handleDisconnect(socketId: string): void {
    const userId = this.socketUser.get(socketId);
    if (!userId) return;
    this.socketUser.delete(socketId);
    const set = this.sockets.get(userId);
    if (set) {
      set.delete(socketId);
      if (set.size === 0) {
        this.sockets.delete(userId);
        this.setConnected(userId, false);
      }
    }
  }

  private setConnected(userId: string, connected: boolean): void {
    const p = this.game.players.find((pl) => pl.userId === userId);
    if (p) {
      p.isConnected = connected;
      if (!connected) p.isReady = false;
      this.broadcast();
    }
  }

  // ============ 坐席 ============

  async sit(userId: string, seatIndex: number, buyIn: number): Promise<void> {
    if (this.findSeat(userId) !== null) throw new GameError('你已经坐在本桌了');
    if (this.game.getPlayer(seatIndex)) throw new GameError('这个座位已有人');
    if (this.game.status === 'playing' || this.game.status === 'showdown') throw new GameError('对局进行中，请稍后再坐下');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new GameError('用户不存在');
    if (buyIn < this.bigBlind) throw new GameError(`带入不能少于大盲 ${this.bigBlind}`);

    await prisma.seat.create({
      data: { roomId: this.id, userId, seatIndex, stack: buyIn, status: 'SEATED' },
    });

    this.game.addPlayer(user.id, user.username, seatIndex, buyIn);
    this.broadcast();
  }

  async stand(userId: string): Promise<void> {
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) return;
    if (this.game.status === 'playing' || this.game.status === 'showdown') throw new GameError('对局进行中，请本局结束后再离开');

    await prisma.seat.deleteMany({ where: { roomId: this.id, userId } });

    this.game.removePlayer(seatIndex);
    this.broadcast();
  }

  // ============ 对局 ============

  startHand(): void {
    const events = this.game.startHand();
    if (events.length === 0) {
      this.broadcast();
      return;
    }
    this.processEvents(events);
  }

  action(userId: string, type: ActionType, amount = 0): void {
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) throw new GameError('你还没有入座');
    const events = this.game.applyAction(seatIndex, type, amount);
    this.processEvents(events);
  }

  chat(userId: string, text: string): void {
    const user = this.game.players.find((p) => p.userId === userId);
    const username = user?.username ?? '观众';
    const seatIndex = user?.seatIndex ?? null;
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    this.io.to(this.roomName()).emit('chat', {
      username,
      text: clean,
      at: Date.now(),
      seatIndex,
    });
  }

  // ============ 准备与摊牌确认 ============

  setReady(userId: string, ready: boolean): void {
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) throw new GameError('你还没有入座');
    if (this.game.status !== 'waiting' && this.game.status !== 'handover') {
      throw new GameError('当前不能准备');
    }
    const p = this.game.getPlayer(seatIndex)!;
    p.isReady = ready;
    this.broadcast();
    this.tryStartByReady();
  }

  private tryStartByReady(): void {
    if (this.game.status !== 'waiting' && this.game.status !== 'handover') return;
    const players = this.game.players;
    if (players.length < 2) return;
    if (players.every((p) => p.isReady)) this.startHand();
  }

  ackShowdown(userId: string): void {
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) return;
    if (this.game.status !== 'showdown') return;
    if (this.game.soleWinnerSeatIndex !== null) return; // 全弃牌场景走 showHand
    this.showdownAcks.add(seatIndex);
    this.broadcast();
    if (this.game.players.every((p) => this.showdownAcks.has(p.seatIndex))) {
      this.finalizeShowdown();
    }
  }

  showHand(userId: string, show: boolean): void {
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) throw new GameError('你还没有入座');
    if (this.game.status !== 'showdown' || this.game.soleWinnerSeatIndex !== seatIndex) {
      throw new GameError('只有赢家能选择是否展示手牌');
    }
    this.finalizeShowdown(show);
  }

  private finalizeShowdown(showWinnerCards = false): void {
    this.showdownAcks = new Set();
    const events = this.game.finalizeShowdown(showWinnerCards);
    this.processEvents(events);
  }

  // ============ 事件处理 ============

  private processEvents(events: EngineEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'showdown':
          this.showdownAcks = new Set();
          break;
        case 'action': {
          const p = this.game.players.find((pl) => pl.seatIndex === e.seatIndex);
          this.lastActionText = this.buildActionText(p?.username ?? '?', e.action, e.amount);
          this.pendingActions.push({
            playerId: p?.userId ?? '',
            seatIndex: e.seatIndex,
            action: e.action,
            amount: e.amount,
            street: e.street ?? '',
          });
          break;
        }
        case 'handEnded':
          void this.handleHandEnd(e.winners);
          break;
        default:
          break;
      }
    }
    this.scheduleAfkCheck();
    this.broadcast();
  }

  private scheduleAfkCheck(): void {
    if (this.afkCheckTimer) {
      clearTimeout(this.afkCheckTimer);
      this.afkCheckTimer = null;
    }
    this.afkCheckPending = false;
    if (this.game.status === 'playing' && this.game.actionSeatIndex !== null) {
      this.afkCheckTimer = setTimeout(() => this.promptAfkCheck(), AFK_CHECK_AFTER_MS);
    }
  }

  private promptAfkCheck(): void {
    this.afkCheckTimer = null;
    if (this.game.status !== 'playing') return;
    const seatIndex = this.game.actionSeatIndex;
    if (seatIndex === null) return;
    const p = this.game.getPlayer(seatIndex);
    if (!p) return;
    this.emitToPlayer(p.userId, 'afkCheck', { deadline: Date.now() + AFK_CHECK_RESPONSE_MS });
    this.afkCheckPending = true;
    this.afkCheckTimer = setTimeout(() => this.onAfkTimeout(), AFK_CHECK_RESPONSE_MS);
  }

  private onAfkTimeout(): void {
    this.afkCheckTimer = null;
    if (this.game.status !== 'playing' || !this.afkCheckPending) return;
    this.afkCheckPending = false;
    const seatIndex = this.game.actionSeatIndex;
    if (seatIndex === null) return;
    const p = this.game.getPlayer(seatIndex);
    if (!p) return;
    const toCall = this.game.currentBet - p.roundBet;
    // 未回应挂机检测：能过牌就过牌，否则弃牌
    const type: ActionType = toCall === 0 ? 'check' : 'fold';
    try {
      const events = this.game.applyAction(seatIndex, type, 0);
      this.processEvents(events);
    } catch {
      /* 忽略竞态 */
    }
  }

  stillHere(userId: string): void {
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) return;
    if (this.game.actionSeatIndex !== seatIndex || !this.afkCheckPending) return;
    if (this.afkCheckTimer) {
      clearTimeout(this.afkCheckTimer);
      this.afkCheckTimer = null;
    }
    this.afkCheckPending = false;
    // 重新计时：一分钟后再检测一次
    this.afkCheckTimer = setTimeout(() => this.promptAfkCheck(), AFK_CHECK_AFTER_MS);
  }

  private emitToPlayer(userId: string, event: string, payload: unknown): void {
    const socketIds = this.sockets.get(userId);
    if (!socketIds) return;
    for (const sid of socketIds) {
      this.io.to(sid).emit(event, payload);
    }
  }

  // ============ 结算落库 ============

  private async handleHandEnd(winners: WinnerInfo[]): Promise<void> {
    const totalPot = winners.reduce((s, w) => s + w.amount, 0);
    const result: HandResult = {
      handNumber: this.game.handNumber,
      board: [...this.game.board],
      winners,
      totalPot,
    };

    try {
      const hand = await prisma.hand.create({
        data: {
          roomId: this.id,
          handNumber: result.handNumber,
          board: JSON.stringify(result.board),
          pot: totalPot,
          winners: JSON.stringify(winners),
        },
      });
      for (const a of this.pendingActions) {
        await prisma.handAction.create({
          data: {
            handId: hand.id,
            playerId: a.playerId,
            seatIndex: a.seatIndex,
            action: a.action,
            amount: a.amount,
            street: a.street,
          },
        });
      }
      for (const p of this.game.players) {
        await prisma.seat.updateMany({
          where: { roomId: this.id, userId: p.userId },
          data: { stack: p.stack },
        });
      }
    } catch (err) {
      console.error('落库失败', err);
    }
    this.pendingActions = [];

    this.io.to(this.roomName()).emit('handResult', result);
  }

  private buildActionText(username: string, action: ActionType, amount: number): string {
    switch (action) {
      case 'fold':
        return `${username} folds`;
      case 'check':
        return `${username} checks`;
      case 'call':
        return `${username} calls`;
      case 'bet':
        return `${username} bets ${amount}`;
      case 'raise':
        return `${username} ${raiseLabel(this.game.betCount)}s to ${amount}`;
      case 'allin':
        return `${username} all-in`;
    }
  }

  // ============ 视图构建 ============

  toPublic(): RoomPublic {
    return {
      id: this.id,
      name: this.name,
      inviteCode: this.inviteCode,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      maxPlayers: this.maxPlayers,
      status: this.game.status === 'playing' || this.game.status === 'showdown' ? 'PLAYING' : 'WAITING',
      playerCount: this.game.players.length,
    };
  }

  buildView(userId: string): TableView {
    const seatIndex = this.findSeat(userId);
    const me = seatIndex === null ? undefined : this.game.getPlayer(seatIndex);
    const totalPot = this.game.players.reduce((s, p) => s + p.totalBet, 0);

    const players: PlayerPublic[] = this.game.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      seatIndex: p.seatIndex,
      stack: p.stack,
      roundBet: p.roundBet,
      totalBet: p.totalBet,
      hasFolded: p.hasFolded,
      isAllIn: p.isAllIn,
      isSittingOut: p.isSittingOut,
      isConnected: p.isConnected,
      isInHand: p.isInHand,
      isReady: p.isReady,
    }));

    return {
      roomId: this.id,
      roomName: this.name,
      inviteCode: this.inviteCode,
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      handNumber: this.game.handNumber,
      status: this.game.status,
      street: this.game.street,
      board: this.game.board,
      pots: this.game.computePots(),
      totalPot,
      currentBet: this.game.currentBet,
      minRaise: this.game.minRaise,
      betCount: this.game.betCount,
      burnCount: this.game.burnCount,
      dealerSeatIndex: this.game.dealerSeatIndex,
      smallBlindSeatIndex: this.game.smallBlindSeatIndex,
      bigBlindSeatIndex: this.game.bigBlindSeatIndex,
      actionSeatIndex: this.game.actionSeatIndex,
      players,
      yourSeatIndex: seatIndex,
      yourCards: me ? me.holeCards : [],
      lastActionText: this.lastActionText,
      showdown:
        this.game.status === 'showdown'
          ? {
              players: this.game.showdownReveals,
              allFolded: this.game.soleWinnerSeatIndex !== null,
              soleWinnerSeatIndex: this.game.soleWinnerSeatIndex,
              ackedSeats: [...this.showdownAcks],
            }
          : null,
    };
  }

  private sendView(socket: Socket, userId: string): void {
    socket.emit('tableState', this.buildView(userId));
  }

  private broadcast(): void {
    for (const [userId, socketIds] of this.sockets) {
      const view = this.buildView(userId);
      for (const sid of socketIds) {
        this.io.to(sid).emit('tableState', view);
      }
    }
  }
}
