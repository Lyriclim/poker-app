import { saveSeat, cashOutSeat, saveRebuy, saveSession } from './seat-ledger';
import { randomUUID } from 'node:crypto';
import { UpdateGate } from './update-gate';
import { saveSettlement } from './settlement';
import { clearHandCheckpoint, saveActivity, saveHandCheckpoint, type HandCheckpoint } from './durable-state';
import { buildTableView, sessionSummaries } from './view';
import { recordFunHand, sessionAwards } from './fun';
import { buyInError } from '@poker/shared';
import type { Server, Socket } from 'socket.io';
import type {
  ActionType,
  HandResult,
  PlayerPublic,
  RoomPublic,
  TableView,
  WinnerInfo,
  RoomSettings, SessionState, SessionPlayer,
} from '@poker/shared';
import { AFK_CHECK_AFTER_MS, AFK_CHECK_RESPONSE_MS } from '@poker/shared';
import { PokerGame, GameError, type EngineEvent } from '../game/engine';
import { prisma } from '../db';
import { freshSession, elapsed, checkpoint } from './session';

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
  smallBlind: number;
  bigBlind: number;
  settings: RoomSettings;
  session: SessionState;
  entries = new Map<string, SessionPlayer>();
  private handStartStacks = new Map<string, number>();
  private handParticipants: string[] = [];
  private handShowdowns: string[] = [];
  private resultPots: TableView['pots'] = [];
  private lastHandResult: HandResult | null = null;
  maxPlayers: number;
  readonly createdBy: string;
  readonly game: PokerGame;

  private io: Server;
  private sockets = new Map<string, Set<string>>(); // userId -> socket ids
  private socketUser = new Map<string, string>(); // socketId -> userId
  private lastActivityAt = Date.now();
  private checkpointError = false;
  private pendingEndingWinners: WinnerInfo[] | null = null;
  private afkCheckTimer: NodeJS.Timeout | null = null;
  private afkCheckPending = false; // 是否正在等待玩家回应挂机检测
  private lastActionText: string | null = null;
  private pendingActions: PendingAction[] = [];
  private updates = new UpdateGate();
  private get mutationBusy(): boolean { return this.updates.busy; }
  private set mutationBusy(value: boolean) { this.updates.busy = value; }
  private readonly instanceId = randomUUID();
  private revision = 0;
  get actionVersion(): string { return `${this.instanceId}:${this.revision}`; }
  onClosedIdle?: () => void;
  private assertWritable(): void {
    if (this.mutationBusy || this.saving || this.saveError || this.checkpointError) throw new GameError('Table is updating. Please try again.');
  }
  private saving = false;
  private saveError = false;
  private retrySettlement: (() => Promise<void>) | null = null;
  private showdownTimer: NodeJS.Timeout | null = null;
  private showdownDeadline: number | null = null;
  networkPaused = false;
  private autoPausedBetweenHands = false;
  private heldShowdownMs = 5_000;

  private holdIfAllOffline(): void {
    const live = this.game.status === 'playing' || this.game.status === 'showdown';
    if (!live) {
      if (this.autoPausedBetweenHands || this.session.paused || !this.session.started || !this.settings.levels.length || this.game.players.some((p) => p.isConnected)) return;
      this.session = { ...checkpoint(this.session), paused: true, runningSince: null };
      this.autoPausedBetweenHands = true;
      return;
    }
    const participants = this.game.players.filter((p) => !live || p.isInHand);
    if (this.networkPaused || this.session.ended || !this.session.started || !participants.length || participants.some((p) => p.isConnected)) return;
    this.networkPaused = true;
    this.revision++;
    this.session = { ...checkpoint(this.session), paused: true, runningSince: null };
    if (this.afkCheckTimer) clearTimeout(this.afkCheckTimer);
    this.afkCheckTimer = null;
    this.afkCheckPending = false;
    this.heldShowdownMs = Math.max(0, (this.showdownDeadline ?? Date.now() + 5_000) - Date.now());
    if (this.showdownTimer) clearTimeout(this.showdownTimer);
    this.showdownTimer = null;
    this.showdownDeadline = null;
  }

  private assertNetworkRunning(): void {
    if (this.networkPaused) throw new GameError('Session held after everyone disconnected. Ask the host to resume.');
  }

  constructor(
    io: Server,
    room: { id: string; name: string; smallBlind: number; bigBlind: number; maxPlayers: number; createdBy: string; settings?: string; session?: string; status?: string },
  ) {
    this.io = io;
    this.id = room.id;
    this.name = room.name;
    this.smallBlind = room.smallBlind;
    this.bigBlind = room.bigBlind;
    this.maxPlayers = room.maxPlayers;
    this.createdBy = room.createdBy;
    this.settings = { mode: 'classic', startingStack: 1000, levelMinutes: 10, levels: [], ...JSON.parse(room.settings || '{}') };
    this.session = { ...freshSession(), ...JSON.parse(room.session || '{}') };
    if (room.status === 'CLOSED') this.session = { ...this.session, ended: true, paused: true, runningSince: null };
    // Freeze a restored session: an interrupted hand cannot be replayed safely.
    if (this.session.started && !this.session.ended) {
      this.session.runningSince = null;
      this.session.paused = true;
      this.session.pauseRequested = false;
    }
    const level = this.settings.levels[this.session.level];
    if (level) { this.smallBlind = level.smallBlind; this.bigBlind = level.bigBlind; }
    this.game = new PokerGame({
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      maxPlayers: room.maxPlayers,
    });
  }

  private roomName(): string {
    return `room:${this.id}`;
  }

  restoreLastActivity(at: Date): void {
    this.lastActivityAt = at.getTime();
  }

  restoreLastHandResult(result: HandResult): void {
    this.lastHandResult = result;
    this.handParticipants = this.game.players.map((player) => player.userId);
    this.game.status = 'handover';
  }

  restoreHand(saved: HandCheckpoint): void {
    this.game.restore(saved.game);
    this.smallBlind = this.game.smallBlind;
    this.bigBlind = this.game.bigBlind;
    // Time spent with the server offline must not advance timed blind levels.
    this.session = { ...saved.session, paused: true, runningSince: null };
    this.entries = new Map(saved.entries.map((entry) => [entry.userId, entry]));
    this.handStartStacks = new Map(saved.handStartStacks);
    this.handParticipants = saved.handParticipants;
    this.handShowdowns = saved.handShowdowns;
    this.resultPots = saved.resultPots ?? [];
    this.lastActionText = saved.lastActionText;
    this.pendingActions = saved.pendingActions;
    this.pendingEndingWinners = saved.endingWinners;
    this.networkPaused = saved.game.status === 'playing' || saved.game.status === 'showdown';
    if (saved.game.status === 'showdown') this.heldShowdownMs = 5_000;
  }

  async resumePendingSettlement(): Promise<void> {
    if (this.pendingEndingWinners) await this.handleHandEnd(this.pendingEndingWinners);
  }

  private noteActivity(): void {
    this.lastActivityAt = Date.now();
    try { saveActivity(this.id, this.lastActivityAt); }
    catch (error) { console.error('Could not persist room activity', this.id, error); }
  }

  private checkpointHand(endingWinners: WinnerInfo[] | null = null): void {
    if (this.game.handNumber === 0) return;
    if (endingWinners) this.pendingEndingWinners = endingWinners;
    const saved: HandCheckpoint = {
      version: 1, game: this.game.checkpoint(), session: checkpoint(this.session),
      entries: [...this.entries.values()].map((entry) => ({ ...entry })),
      handStartStacks: [...this.handStartStacks], handParticipants: this.handParticipants,
      handShowdowns: this.handShowdowns, resultPots: this.resultPots,
      lastActionText: this.lastActionText, pendingActions: this.pendingActions,
      endingWinners: this.pendingEndingWinners,
    };
    try { saveHandCheckpoint(this.id, saved); this.checkpointError = false; }
    catch (error) { this.checkpointError = true; this.saveError = true; throw error; }
  }

  canArchive(cutoff: number): boolean {
    return !this.session.ended && this.lastActivityAt <= cutoff && this.socketUser.size === 0 &&
      !this.mutationBusy && !this.saving && !this.saveError && !this.checkpointError &&
      this.game.status !== 'playing' && this.game.status !== 'showdown';
  }

  canRestart(): boolean {
    return this.socketUser.size === 0 && !this.mutationBusy && !this.saving && !this.saveError && !this.checkpointError &&
      this.game.status !== 'playing' && this.game.status !== 'showdown';
  }

  private findSeat(userId: string): number | null {
    return this.game.players.find((p) => p.userId === userId)?.seatIndex ?? null;
  }

  // ============ 连接管理 ============

  join(socket: Socket, user: SocketUser): void {
    this.noteActivity();
    socket.join(this.roomName());
    if (!this.socketUser.has(socket.id)) {
      this.socketUser.set(socket.id, user.id);
      const set = this.sockets.get(user.id) ?? new Set<string>();
      set.add(socket.id);
      this.sockets.set(user.id, set);
    }
    this.setConnected(user.id, true);
    this.sendView(socket, user.id);
    const returningPlayer = this.game.players.find((p) => p.userId === user.id);
    if (this.lastHandResult && this.game.status === 'handover' && returningPlayer && this.handParticipants.includes(user.id) && !returningPlayer.isReady) socket.emit('handResult', this.lastHandResult);
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
    this.releaseIfIdle();
  }

  private releaseIfIdle(): void {
    if (this.session.ended && this.socketUser.size === 0 && !this.mutationBusy && !this.saving && !this.saveError) this.onClosedIdle?.();
  }

  private setConnected(userId: string, connected: boolean): void {
    const p = this.game.players.find((pl) => pl.userId === userId);
    if (p) {
      if (p.isConnected === connected) return;
      p.isConnected = connected;
      if (!connected && this.game.status !== 'handover') p.isReady = false;
      if (connected && this.autoPausedBetweenHands) {
        this.autoPausedBetweenHands = false;
        this.session = { ...this.session, paused: false, runningSince: Date.now() };
      }
      if (!connected) this.holdIfAllOffline();
      this.broadcast();
      this.tryStartByReady();
    }
  }

  // ============ 坐席 ============

  async sit(userId: string, seatIndex: number, buyIn: number): Promise<void> {
    if (this.session.ended) throw new GameError('This session has ended. Create a new table in the lobby.');
    if (this.settings.mode === 'tournament') {
      if (this.session.started) throw new GameError('This tournament has already started. You can watch.');
      buyIn = this.settings.startingStack;
    }
    this.assertWritable();
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= this.maxPlayers) throw new GameError('Invalid seat');
    const invalidBuyIn = buyInError(buyIn, this.bigBlind);
    if (invalidBuyIn) throw new GameError(invalidBuyIn);
    if (this.findSeat(userId) !== null) throw new GameError('You already have a seat');
    if (this.game.getPlayer(seatIndex)) throw new GameError('Seat is occupied');
    if ((this.entries.get(userId)?.buyIn ?? 0) + buyIn > 2_000_000_000) throw new GameError('Session buy-in limit reached');
    this.mutationBusy = true;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new GameError('User not found');
      if (buyIn < this.bigBlind) throw new GameError(`Minimum buy-in is ${this.bigBlind}`);

      await saveSeat(this.id, userId, user.username, seatIndex, buyIn);
      const entry = this.entries.get(userId) ?? { userId, username: user.username, buyIn: 0, cashOut: 0, rank: null };
      entry.buyIn += buyIn; this.entries.set(userId, entry);

      this.game.addPlayer(user.id, user.username, seatIndex, buyIn);
      this.game.getPlayer(seatIndex)!.isConnected = this.sockets.has(userId);
      if (this.game.status === 'playing' || this.game.status === 'showdown') this.checkpointHand();
      this.broadcast();
    } finally { this.mutationBusy = false; this.tryStartByReady(); this.releaseIfIdle(); }
  }

  async stand(userId: string): Promise<void> {
    this.assertWritable();
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) return;
    if (this.game.getPlayer(seatIndex)?.isInHand) throw new GameError('Wait until this hand ends before leaving your seat');
    if (this.settings.mode === 'tournament' && this.session.started && !this.session.ended && this.game.getPlayer(seatIndex)!.stack > 0) throw new GameError('You cannot leave a live tournament seat. Return to the lobby to watch another table.');

    this.mutationBusy = true;
    try {
      const stack = this.session.ended ? 0 : this.game.getPlayer(seatIndex)!.stack;
      await cashOutSeat(this.id, userId, stack, this.settings.mode === 'tournament' && !this.session.started);
      const entry = this.entries.get(userId); if (entry) entry.cashOut += stack;
      if (this.settings.mode === 'tournament' && !this.session.started) this.entries.delete(userId);

      this.game.removePlayer(seatIndex);
      if (this.game.status === 'playing' || this.game.status === 'showdown') this.checkpointHand();
      this.broadcast();
    } finally { this.mutationBusy = false; this.tryStartByReady(); this.releaseIfIdle(); }
  }

  async resize(userId: string, maxPlayers: number): Promise<void> {
    if (userId !== this.createdBy) throw new GameError('Only the host can change seats');
    this.assertWritable();
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 9) throw new GameError('Choose 2 to 9 seats');
    if (maxPlayers < this.maxPlayers && (this.game.status === 'playing' || this.game.status === 'showdown')) throw new GameError('Seats can only be reduced between hands');
    if (this.game.players.some((p) => p.seatIndex >= maxPlayers)) throw new GameError('An occupied seat cannot be removed');
    this.mutationBusy = true;
    try {
      await prisma.room.update({ where: { id: this.id }, data: { maxPlayers } });
      this.maxPlayers = maxPlayers;
      this.game.maxPlayers = maxPlayers;
      if (this.game.status === 'playing' || this.game.status === 'showdown') this.checkpointHand();
      this.broadcast();
    } finally { this.mutationBusy = false; this.tryStartByReady(); this.releaseIfIdle(); }
  }

  async rebuy(userId: string, amount: number): Promise<void> {
    this.assertWritable();
    if (this.settings.mode !== 'classic' || this.session.ended) throw new GameError('Rebuy is available in active Classic sessions only');
    const player = this.game.players.find((p) => p.userId === userId);
    if (!player || player.stack !== 0 || player.isInHand) throw new GameError('Rebuy after your chips are gone and your hand has settled');
    const invalidBuyIn = buyInError(amount, 1);
    if (invalidBuyIn) throw new GameError(invalidBuyIn);
    const entry = this.entries.get(userId);
    if (!entry || entry.buyIn + amount > 2_000_000_000) throw new GameError('Session buy-in limit reached');
    this.mutationBusy = true;
    try {
      await saveRebuy(this.id, userId, amount);
      player.stack = amount; player.isAllIn = false; player.isReady = true;
      entry.buyIn += amount;
      this.broadcast();
    } finally { this.mutationBusy = false; this.tryStartByReady(); this.releaseIfIdle(); }
  }

  private finishSession(): void {
    if (this.session.ended) return;
    const awards = sessionAwards(this.session.fun, sessionSummaries(this));
    this.session = { ...checkpoint(this.session), ended: true, paused: true, pauseRequested: false, runningSince: null,
      fun: { ...this.session.fun, awards } };
    for (const p of this.game.players) { const e = this.entries.get(p.userId); if (e) e.cashOut += p.stack; }
  }

  async control(userId: string, operation: string): Promise<void> {
    if (userId !== this.createdBy) throw new GameError('Only the host can manage this session');
    this.assertWritable();
    if (this.session.ended) throw new GameError('This session has ended');
    const before = { ...this.session };
    const beforeEntries = new Map([...this.entries].map(([id, e]) => [id, { ...e }]));
    const live = this.game.status === 'playing' || this.game.status === 'showdown';
    if (operation === 'lastHand' || operation === 'cancelLastHand') {
      if (this.settings.mode !== 'classic') throw new GameError('Last hand is available in Classic sessions. Tournaments finish with a champion.');
      this.session.lastHand = operation === 'cancelLastHand' ? null : live ? this.game.handNumber : this.game.handNumber + 1;
    } else if (operation === 'start') {
      if (this.settings.mode !== 'tournament' || this.session.started) throw new GameError('Tournament already started');
      const players = this.game.players;
      if (players.length < 2 || !players.every((p) => p.isConnected && p.stack > 0 && p.isReady)) throw new GameError('At least two players must be seated, online and ready');
      this.session.started = true; this.session.runningSince = Date.now();
    } else if (operation === 'pause') {
      if (live) this.session.pauseRequested = true;
      else this.session = { ...checkpoint(this.session), paused: true, runningSince: null };
    } else if (operation === 'resume') {
      if (this.networkPaused && this.game.players.filter((p) => p.isConnected && (live ? p.isInHand : p.stack > 0)).length < 2) throw new GameError('At least two players must return before resuming');
      this.session = checkpoint(this.session);
      this.session.paused = false; this.session.pauseRequested = false;
      this.session.runningSince = this.session.started ? Date.now() : null;
    } else if (operation === 'end') {
      if (live) throw new GameError('End the session between hands');
      this.finishSession();
    } else throw new GameError('Invalid session operation');
    this.mutationBusy = true;
    try {
      await saveSession(this.id, checkpoint(this.session), [...this.entries.values()]);
    } catch (err) {
      this.session = this.networkPaused ? { ...checkpoint(before), paused: true, runningSince: null } : before;
      this.entries = beforeEntries;
      throw err;
    }
    finally { this.mutationBusy = false; this.releaseIfIdle(); }
    if (live) this.checkpointHand();
    if (operation === 'resume' && this.networkPaused) {
      if (this.game.players.filter((p) => p.isConnected && (live ? p.isInHand : p.stack > 0)).length < 2) {
        this.session = { ...checkpoint(this.session), paused: true, runningSince: null };
        this.broadcast();
        throw new GameError('Players disconnected during resume. Wait for two players to return.');
      }
      this.networkPaused = false;
      this.holdIfAllOffline();
      if (!this.networkPaused) {
        this.revision++;
        this.scheduleAfkCheck();
        if (this.game.status === 'showdown') {
          this.showdownDeadline = Date.now() + this.heldShowdownMs;
          this.showdownTimer = setTimeout(() => this.finalizeShowdown(), this.heldShowdownMs);
        }
      }
    }
    this.broadcast(); this.tryStartByReady();
  }

  async removeOffline(userId: string, target: string): Promise<void> {
    if (userId !== this.createdBy) throw new GameError('Only the host can remove offline seats');
    const player = this.game.players.find((p) => p.userId === target);
    if (!player || player.isConnected) throw new GameError('Only offline seats can be removed');
    if (this.game.status === 'playing' || this.game.status === 'showdown') throw new GameError('Remove offline seats between hands');
    await this.stand(target);
  }

  // ============ 对局 ============

  startHand(): void {
    if (this.networkPaused || this.mutationBusy || this.saving || this.saveError || this.session.ended || this.session.paused) return;
    if (this.settings.mode === 'tournament' && !this.session.started) return;
    this.game.includeDisconnected = this.settings.mode === 'tournament';
    if (!this.session.started) { this.session.started = true; this.session.runningSince = Date.now(); }
    if (this.settings.levels.length) {
      this.session.level = Math.min(this.settings.levels.length - 1, Math.floor(elapsed(this.session) / (this.settings.levelMinutes * 60_000)));
      const level = this.settings.levels[this.session.level];
      this.smallBlind = this.game.smallBlind = level.smallBlind;
      this.bigBlind = this.game.bigBlind = level.bigBlind;
    }
    this.handStartStacks = new Map(this.game.players.map((p) => [p.userId, p.stack]));
    this.lastActionText = null;
    const events = this.game.startHand();
    if (events.length) this.lastHandResult = null;
    this.handParticipants = this.game.players.filter((p) => p.isInHand).map((p) => p.userId);
    this.handShowdowns = [];
    if (events.length === 0) {
      this.broadcast();
      return;
    }
    this.processEvents(events);
  }

  action(userId: string, type: ActionType, amount = 0, expectedVersion?: string): void {
    this.assertNetworkRunning();
    if (this.checkpointError || this.saveError) throw new GameError('Save failed. Retry before acting.');
    if (expectedVersion !== undefined && expectedVersion !== this.actionVersion) throw new GameError('The table has changed. Review the current action and try again.');
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) throw new GameError('Take a seat first');
    const events = this.game.applyAction(seatIndex, type, amount);
    this.processEvents(events);
  }

  chat(userId: string, text: string): void {
    if (typeof text !== 'string') throw new GameError('Invalid chat message');
    const user = this.game.players.find((p) => p.userId === userId);
    const username = user?.username ?? 'Spectator';
    const seatIndex = user?.seatIndex ?? null;
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    this.noteActivity();
    this.io.to(this.roomName()).emit('chat', {
      username,
      text: clean,
      at: Date.now(),
      seatIndex,
    });
  }

  // ============ 发牌确认与亮牌 ============

  setReady(userId: string, ready: boolean): void {
    if (this.session.ended) throw new GameError('This session has ended');
    if (typeof ready !== 'boolean') throw new GameError('Invalid ready state');
    if (this.saving || this.saveError) throw new GameError('Waiting for settlement to be saved');
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) throw new GameError('Take a seat first');
    if (this.game.status !== 'waiting' && this.game.status !== 'handover') {
      throw new GameError('Wait until the hand ends to get ready');
    }
    const p = this.game.getPlayer(seatIndex)!;
    if (p.stack <= 0) throw new GameError(this.settings.mode === 'classic' ? 'Buy in again to play' : 'You have been eliminated');
    if (p.isReady === ready) return;
    p.isReady = ready;
    this.broadcast();
    this.tryStartByReady();
  }

  private tryStartByReady(): void {
    if (this.game.status !== 'waiting' && this.game.status !== 'handover') return;
    if (this.settings.mode === 'classic' && this.game.status === 'handover' && this.game.players.some((p) => p.isConnected && p.stack === 0)) return;
    const tournament = this.settings.mode === 'tournament' && this.session.started;
    const players = this.game.players.filter((p) => (p.isConnected || tournament) && p.stack > 0 && !p.isSittingOut);
    if (players.length < 2) return;
    if (players.some((p) => p.isConnected) && players.every((p) => p.isReady || (tournament && !p.isConnected))) this.startHand();
  }

  showHand(userId: string, show: boolean): void {
    this.assertNetworkRunning();
    if (this.checkpointError || this.saveError) throw new GameError('Save failed. Retry before acting.');
    const seatIndex = this.findSeat(userId);
    if (seatIndex === null) throw new GameError('Take a seat first');
    if (this.game.status !== 'showdown' || this.game.soleWinnerSeatIndex !== seatIndex) {
      throw new GameError('Only the winner can choose to show cards');
    }
    this.finalizeShowdown(show);
  }

  private finalizeShowdown(showWinnerCards = false): void {
    if (this.networkPaused) return;
    if (this.checkpointError || this.saveError) { this.showdownTimer = null; return; }
    if (this.showdownTimer) clearTimeout(this.showdownTimer);
    this.showdownTimer = null;
    this.showdownDeadline = null;
    const events = this.game.finalizeShowdown(showWinnerCards);
    this.processEvents(events);
  }

  // ============ 事件处理 ============

  private processEvents(events: EngineEvent[]): void {
    if (events.length) this.revision++;
    let endingWinners: WinnerInfo[] | null = null;
    for (const e of events) {
      switch (e.type) {
        case 'showdown':
          this.handShowdowns = this.game.soleWinnerSeatIndex === null
            ? this.game.players.filter((p) => p.isInHand && !p.hasFolded).map((p) => p.userId) : [];
          this.resultPots = this.game.soleWinnerSeatIndex !== null ? [{ amount: e.winners.reduce((sum, w) => sum + w.amount, 0), eligibleSeatIndexes: [this.game.soleWinnerSeatIndex] }] : this.game.computePots().map((pot) => ({ ...pot, eligibleSeatIndexes: [...pot.eligibleSeatIndexes] }));
          this.showdownDeadline = Date.now() + 5_000;
          this.showdownTimer = setTimeout(() => this.finalizeShowdown(), 5_000);
          console.info(JSON.stringify({ event: 'hand.showdown', at: new Date().toISOString(), roomId: this.id, handNumber: this.game.handNumber, displayMs: 5_000 }));
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
          endingWinners = e.winners;
          break;
        default:
          break;
      }
    }
    if (events.length) this.checkpointHand(endingWinners);
    if (endingWinners) void this.handleHandEnd(endingWinners);
    this.scheduleAfkCheck();
    // handleHandEnd already broadcasts the saving state, then the saved result.
    if (!endingWinners) this.broadcast();
  }

  private scheduleAfkCheck(): void {
    if (this.afkCheckTimer) {
      clearTimeout(this.afkCheckTimer);
      this.afkCheckTimer = null;
    }
    this.afkCheckPending = false;
    if (!this.networkPaused && this.game.status === 'playing' && this.game.actionSeatIndex !== null) {
      this.afkCheckTimer = setTimeout(() => this.promptAfkCheck(), AFK_CHECK_AFTER_MS);
    }
  }

  private promptAfkCheck(): void {
    this.afkCheckTimer = null;
    if (this.networkPaused || this.game.status !== 'playing') return;
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
    if (this.networkPaused || this.game.status !== 'playing' || !this.afkCheckPending) return;
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
    const settlementStartedAt = performance.now();
    // Finish an in-flight seat/ledger mutation before capturing settlement balances.
    // Block readiness immediately so a new hand cannot start during this wait.
    if (this.mutationBusy) {
      this.saving = true;
      this.broadcast();
      await this.updates.idle();
      this.saving = false;
    }
    const totalPot = winners.reduce((s, w) => s + w.amount, 0);
    const result: HandResult = {
      handNumber: this.game.handNumber,
      board: [...this.game.board],
      winners,
      totalPot,
      pots: this.resultPots,
    };
    this.session = { ...this.session, fun: recordFunHand(this.session.fun, this.game.handNumber,
      this.handParticipants, this.handShowdowns, this.handStartStacks, sessionSummaries(this)) };
    if (this.settings.mode === 'tournament') {
      const eliminated = this.game.players.filter((p) => p.stack === 0 && this.entries.get(p.userId)?.rank === null).sort((a, b) => (this.handStartStacks.get(a.userId) ?? 0) - (this.handStartStacks.get(b.userId) ?? 0));
      const remaining = [...this.entries.values()].filter((e) => e.rank === null).length;
      eliminated.forEach((p, i) => {
        const firstEqual = eliminated.findIndex((other) => this.handStartStacks.get(other.userId) === this.handStartStacks.get(p.userId));
        this.entries.get(p.userId)!.rank = remaining - firstEqual;
      });
      const survivors = this.game.players.filter((p) => p.stack > 0);
      if (survivors.length === 1) { this.entries.get(survivors[0].userId)!.rank = 1; this.finishSession(); }
    }
    if (this.session.lastHand !== null && this.game.handNumber >= this.session.lastHand) this.finishSession();
    if (this.session.pauseRequested && !this.session.ended) {
      this.session = { ...checkpoint(this.session), paused: true, pauseRequested: false, runningSince: null };
    }

    const actions = this.pendingActions;
    this.pendingActions = [];
    const seats = this.game.players.map((p) => ({ userId: p.userId, stack: p.stack }));
    const settlement = {
      roomId: this.id, result, actions, seats,
      entries: [...this.entries.values()].map((entry) => ({ ...entry })),
      session: checkpoint(this.session)
    };
    let attempt = 0;
    this.retrySettlement = async () => {
      if (this.saving) return;
      attempt++;
      this.saving = true;
      this.saveError = false;
      this.broadcast();
      const saveStartedAt = performance.now();
      try {
        await saveSettlement(settlement);
        try { clearHandCheckpoint(this.id); } catch (error) { console.error('Could not remove settled hand checkpoint', error); }
        this.pendingEndingWinners = null;
        this.retrySettlement = null;
        this.lastHandResult = result;
        this.io.to(this.roomName()).emit('handResult', result);
        console.info(JSON.stringify({ event: 'hand.settled', at: new Date().toISOString(), roomId: this.id, handNumber: result.handNumber, attempt, saveMs: Math.round(performance.now() - saveStartedAt), afterShowdownMs: Math.round(performance.now() - settlementStartedAt), actions: actions.length, seats: seats.length }));
      } catch (err) {
        this.saveError = true;
        console.error('Settlement could not be saved', err);
      } finally {
        this.saving = false;
        this.broadcast();
        this.releaseIfIdle();
      }
    };
    await this.retrySettlement();
  }

  async retrySave(userId: string): Promise<void> {
    if (this.findSeat(userId) === null && userId !== this.createdBy) throw new GameError('Only a seated player or the host can retry');
    if (this.checkpointError) {
      this.checkpointHand();
      this.saveError = false;
      if (this.pendingEndingWinners) await this.handleHandEnd(this.pendingEndingWinners);
      else {
        this.scheduleAfkCheck();
        if (this.game.status === 'showdown' && !this.showdownTimer) {
          const remaining = Math.max(0, (this.showdownDeadline ?? Date.now() + 5_000) - Date.now());
          this.showdownTimer = setTimeout(() => this.finalizeShowdown(), remaining);
        }
        this.broadcast();
      }
      return;
    }
    await this.retrySettlement?.();
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
        return `${username} raises (+${amount} chips)`;
      case 'allin':
        return `${username} all-in`;
    }
  }

  // ============ 视图构建 ============

  toPublic(): RoomPublic {
    return {
      id: this.id,
      name: this.name,
      mode: this.settings.mode,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      maxPlayers: this.maxPlayers,
      status: this.session.ended ? 'CLOSED' : this.session.paused ? 'PAUSED' : this.game.status === 'playing' || this.game.status === 'showdown' ? 'PLAYING' : 'WAITING',
      playerCount: this.game.players.length,
    };
  }

  buildView(userId: string): TableView {
    return buildTableView(this, userId, {
      saving: this.saving, saveError: this.saveError,
      lastActionText: this.lastActionText,
      showdownDeadline: this.showdownDeadline
    });
  }

  private sendView(socket: Socket, userId: string): void {
    socket.emit('tableState', this.buildView(userId));
  }

  private broadcast(): void {
    this.noteActivity();
    for (const [userId, socketIds] of this.sockets) {
      const view = this.buildView(userId);
      for (const sid of socketIds) {
        this.io.to(sid).emit('tableState', view);
      }
    }
  }
}
