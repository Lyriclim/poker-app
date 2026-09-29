import type { ActionType, Card, HandStatus, Street, WinnerInfo, PotSlice, ShowdownPlayer } from '@poker/shared';
import { createDeck, shuffle, secureRandom } from './deck';
import { evaluateBest, compareHands, describeHand, bestFiveCards } from './hand-evaluator';
import { computeSidePots } from './pots';

export class GameError extends Error {}

// Buy-ins are capped separately. A player can win more than one buy-in;
// persisted chip fields use Prisma Int (signed 32-bit).
const MAX_STORED_CHIPS = 2_147_483_647;

export interface EnginePlayer {
  userId: string;
  username: string;
  seatIndex: number;
  stack: number; // 未投入的剩余筹码
  holeCards: Card[];
  hasFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  isConnected: boolean;
  isInHand: boolean; // 是否参与当前这一手
  roundBet: number; // 本轮已投入
  totalBet: number; // 本手已投入
  hasActed: boolean; // 本轮是否已行动
  actedAtBet: number;
  raiseThreshold: number;
  isReady: boolean; // 是否已准备开局
}

export type EngineEvent =
  | { type: 'handStarted'; handNumber: number }
  | { type: 'streetDealt'; street: Street; cards: Card[] }
  | { type: 'action'; seatIndex: number; action: ActionType; amount: number; street: Street }
  | { type: 'showdown'; winners: WinnerInfo[] }
  | { type: 'handEnded'; winners: WinnerInfo[] };

export interface EngineOptions {
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  rng?: () => number;
  deck?: Card[]; // 测试注入固定牌组
}

/** Server-only state. Never send this to a client: it includes the deck and every hole card. */
export type GameCheckpoint = Pick<PokerGame,
  'includeDisconnected' | 'smallBlind' | 'bigBlind' | 'maxPlayers' | 'players' | 'deck' |
  'board' | 'street' | 'status' | 'handNumber' | 'dealerSeatIndex' |
  'smallBlindSeatIndex' | 'bigBlindSeatIndex' | 'actionSeatIndex' | 'currentBet' |
  'minRaise' | 'betCount' | 'burnCount' | 'showdownReveals' | 'soleWinnerSeatIndex'
> & { lastWinners: WinnerInfo[] };

/**
 * 纯游戏引擎：只管规则与状态，不做任何网络 / 数据库 / 定时器操作。
 * 所有方法同步返回事件数组，由外层（Table）负责广播与调度。
 */
export class PokerGame {
  includeDisconnected = false;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;

  players: EnginePlayer[] = [];
  deck: Card[] = [];
  board: Card[] = [];
  street: Street | null = null;
  status: HandStatus = 'waiting';
  handNumber = 0;
  dealerSeatIndex: number | null = null;
  smallBlindSeatIndex: number | null = null;
  bigBlindSeatIndex: number | null = null;
  actionSeatIndex: number | null = null;
  currentBet = 0;
  minRaise = 0;
  betCount = 0; // 本轮下注次数：盲注=1、翻牌后首个下注=1；用于 3-bet/4-bet 标签
  burnCount = 0; // 本手已切（burn）的牌数，发公共牌前各切一张

  /** 摊牌阶段展示数据（showdown() 填充，finalizeShowdown() 清空） */
  showdownReveals: ShowdownPlayer[] = [];
  /** 全弃牌时唯一赢家的座位；null 表示正常多人摊牌 */
  soleWinnerSeatIndex: number | null = null;

  private lastWinners: WinnerInfo[] = [];
  private rng: () => number;
  private fixedDeck?: Card[];

  constructor(opts: EngineOptions) {
    this.smallBlind = opts.smallBlind;
    this.bigBlind = opts.bigBlind;
    this.maxPlayers = opts.maxPlayers;
    this.rng = opts.rng ?? secureRandom;
    this.fixedDeck = opts.deck;
  }

  checkpoint(): GameCheckpoint {
    return {
      includeDisconnected: this.includeDisconnected, smallBlind: this.smallBlind, bigBlind: this.bigBlind,
      maxPlayers: this.maxPlayers, players: this.players, deck: this.deck, board: this.board,
      street: this.street, status: this.status, handNumber: this.handNumber,
      dealerSeatIndex: this.dealerSeatIndex, smallBlindSeatIndex: this.smallBlindSeatIndex,
      bigBlindSeatIndex: this.bigBlindSeatIndex, actionSeatIndex: this.actionSeatIndex,
      currentBet: this.currentBet, minRaise: this.minRaise, betCount: this.betCount,
      burnCount: this.burnCount, showdownReveals: this.showdownReveals,
      soleWinnerSeatIndex: this.soleWinnerSeatIndex, lastWinners: this.lastWinners,
    };
  }

  restore(saved: GameCheckpoint): void {
    if (!Number.isSafeInteger(saved.handNumber) || saved.handNumber < 1 ||
      !['playing', 'showdown', 'handover'].includes(saved.status) || !Array.isArray(saved.players) || !Array.isArray(saved.deck)) {
      throw new GameError('Invalid saved hand');
    }
    Object.assign(this, saved);
    this.lastWinners = saved.lastWinners;
    // Connections belong to the old process. A restored live hand waits for players.
    for (const player of this.players) { player.isConnected = false; player.isReady = false; }
  }

  // ============ 玩家管理 ============

  addPlayer(userId: string, username: string, seatIndex: number, stack: number): void {
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= this.maxPlayers) throw new GameError('Invalid seat');
    if (!Number.isSafeInteger(stack) || stack < 0 || stack > MAX_STORED_CHIPS) throw new GameError('Invalid chip amount');
    if (this.players.some((p) => p.userId === userId)) throw new GameError('You already have a seat');
    if (this.players.some((p) => p.seatIndex === seatIndex)) {
      throw new GameError('Seat is occupied');
    }
    this.players.push({
      userId,
      username,
      seatIndex,
      stack,
      holeCards: [],
      hasFolded: false,
      isAllIn: false,
      isSittingOut: false,
      isConnected: true,
      isInHand: false,
      roundBet: 0,
      totalBet: 0,
      hasActed: false,
      actedAtBet: 0,
      raiseThreshold: this.bigBlind,
      isReady: false,
    });
    this.players.sort((a, b) => a.seatIndex - b.seatIndex);
  }

  removePlayer(seatIndex: number): void {
    this.players = this.players.filter((p) => p.seatIndex !== seatIndex);
  }

  getPlayer(seatIndex: number): EnginePlayer | undefined {
    return this.players.find((p) => p.seatIndex === seatIndex);
  }

  /** 本手参与玩家（有筹码且未暂离） */
  private participants(): EnginePlayer[] {
    return this.players.filter((p) => p.stack > 0 && !p.isSittingOut && (p.isConnected || this.includeDisconnected));
  }

  private inHand(): EnginePlayer[] {
    return this.players.filter((p) => p.isInHand);
  }

  private active(): EnginePlayer[] {
    return this.players.filter((p) => p.isInHand && !p.hasFolded);
  }

  private eligible(): EnginePlayer[] {
    return this.players.filter((p) => p.isInHand && !p.hasFolded && !p.isAllIn);
  }

  // ============ 座位顺序辅助 ============

  /** 在给定列表里找 seatIndex 顺时针下一位 */
  private nextSeat(from: number, list: EnginePlayer[]): number {
    const sorted = [...list].sort((a, b) => a.seatIndex - b.seatIndex);
    for (const p of sorted) if (p.seatIndex > from) return p.seatIndex;
    return sorted[0]?.seatIndex ?? from;
  }

  /** 从 from 起顺时针找下一个可行动（未弃牌、未全下）的座位 */
  private nextEligible(from: number): number | null {
    const elig = this.eligible().sort((a, b) => a.seatIndex - b.seatIndex);
    if (elig.length === 0) return null;
    for (const p of elig) if (p.seatIndex > from) return p.seatIndex;
    return elig[0].seatIndex;
  }

  // ============ 下注 ============

  private commit(p: EnginePlayer, amount: number): void {
    const real = Math.min(amount, p.stack);
    p.stack -= real;
    p.roundBet += real;
    p.totalBet += real;
    if (p.stack === 0) p.isAllIn = true;
  }

  // ============ 开局 ============

  startHand(): EngineEvent[] {
    if (this.status === 'playing' || this.status === 'showdown') return [];
    const participants = this.participants();
    if (participants.length < 2) return [];

    this.handNumber++;
    this.deck = this.fixedDeck ? [...this.fixedDeck] : shuffle(createDeck(), this.rng);
    this.board = [];
    this.street = 'preflop';
    this.status = 'playing';
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.betCount = 0;
    this.burnCount = 0;
    this.actionSeatIndex = null;
    this.smallBlindSeatIndex = null;
    this.bigBlindSeatIndex = null;

    for (const p of this.players) {
      p.holeCards = [];
      p.hasFolded = false;
      p.isAllIn = false;
      p.roundBet = 0;
      p.totalBet = 0;
      p.hasActed = false;
      p.actedAtBet = 0;
      p.raiseThreshold = this.bigBlind;
      p.isInHand = participants.includes(p);
      p.isReady = false;
    }

    // 按钮顺时针移动
    const prevDealer = this.dealerSeatIndex;
    this.dealerSeatIndex =
      prevDealer == null
        ? participants[0].seatIndex
        : this.nextSeat(prevDealer, participants);

    // 发底牌
    for (const p of participants) {
      p.holeCards = [this.deck.pop()!, this.deck.pop()!];
    }

    // 盲注
    const n = participants.length;
    if (n === 2) {
      // 单挑：按钮位就是小盲
      this.smallBlindSeatIndex = this.dealerSeatIndex;
      this.bigBlindSeatIndex = this.nextSeat(this.dealerSeatIndex, participants);
    } else {
      this.smallBlindSeatIndex = this.nextSeat(this.dealerSeatIndex, participants);
      this.bigBlindSeatIndex = this.nextSeat(this.smallBlindSeatIndex, participants);
    }
    const sb = this.getPlayer(this.smallBlindSeatIndex)!;
    const bb = this.getPlayer(this.bigBlindSeatIndex)!;
    this.commit(sb, this.smallBlind);
    this.commit(bb, this.bigBlind);
    this.currentBet = this.bigBlind;
    if (this.eligible().length <= 1) this.currentBet = Math.max(...participants.map((p) => p.roundBet));
    this.betCount = 1; // 大盲视为第 1 个下注

    // 首位行动者：大盲左手第一个可行动者（UTG）
    this.actionSeatIndex = this.nextEligible(this.bigBlindSeatIndex);

    if (this.noFurtherBetting()) {
      return [{ type: 'handStarted', handNumber: this.handNumber }, ...this.runOutAndShowdown()];
    }

    return [{ type: 'handStarted', handNumber: this.handNumber }];
  }

  // ============ 行动 ============

  canRaise(seatIndex: number): boolean {
    const p = this.getPlayer(seatIndex);
    return !!p && p.isInHand && !p.hasFolded && !p.isAllIn &&
      this.eligible().length > 1 &&
      (!p.hasActed || this.currentBet - p.actedAtBet >= p.raiseThreshold);
  }

  private noFurtherBetting(): boolean {
    const players = this.eligible();
    if (players.length === 0) return true;
    if (players.length > 1) return false;
    const otherBet = Math.max(0, ...this.active().filter((p) => p !== players[0]).map((p) => p.roundBet));
    return players[0].roundBet >= otherBet;
  }

  applyAction(seatIndex: number, action: ActionType, amount = 0): EngineEvent[] {
    if (!['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(action)) throw new GameError('Invalid action');
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_STORED_CHIPS) throw new GameError('Enter a whole chip amount');
    if (this.status !== 'playing') throw new GameError('No hand is in progress');
    if (this.actionSeatIndex !== seatIndex) throw new GameError('It is not your turn');
    const p = this.getPlayer(seatIndex);
    if (!p || !p.isInHand || p.hasFolded || p.isAllIn) throw new GameError('You cannot act now');

    const toCall = this.currentBet - p.roundBet;
    const beforeBet = p.roundBet;
    if ((action === 'raise' || action === 'bet' || (action === 'allin' && p.roundBet + p.stack > this.currentBet)) && !this.canRaise(seatIndex)) {
      throw new GameError('Betting has not reopened. Call or fold.');
    }

    switch (action) {
      case 'fold':
        p.hasFolded = true;
        break;

      case 'check':
        if (toCall !== 0) throw new GameError('You must call or fold');
        p.hasActed = true;
        break;

      case 'call':
        if (toCall === 0) {
          p.hasActed = true; // 视作过牌
        } else {
          this.commit(p, Math.min(toCall, p.stack));
          p.hasActed = true;
        }
        break;

      case 'bet': {
        if (amount > p.stack) throw new GameError('Not enough chips');
        if (this.currentBet !== 0) throw new GameError('There is a bet already; use raise');
        if (amount < this.bigBlind) throw new GameError(`Minimum bet is the big blind: ${this.bigBlind}`);
        this.commit(p, Math.min(amount, p.stack));
        this.currentBet = p.roundBet;
        this.minRaise = p.roundBet;
        this.betCount = 1;
        p.hasActed = true;
        break;
      }

      case 'raise': {
        if (this.currentBet === 0) throw new GameError('Use bet instead');
        const raiseTo = amount;
        const maxRaiseTo = p.roundBet + p.stack;
        const minFullRaiseTo = this.currentBet + this.minRaise;
        if (raiseTo > maxRaiseTo) throw new GameError('Not enough chips');
        if (raiseTo <= this.currentBet) throw new GameError('Raise must exceed the current bet');
        // 未达到最小加注、且又不是全下 → 非法
        if (raiseTo < minFullRaiseTo && raiseTo < maxRaiseTo) {
          throw new GameError(`Minimum raise to ${minFullRaiseTo}`);
        }
        const increment = raiseTo - this.currentBet;
        this.commit(p, raiseTo - p.roundBet);
        this.currentBet = raiseTo;
        this.betCount += 1;
        // 只有完整加注才重置最小加注增量；短码全下（under-raise）不重开加注
        if (raiseTo >= minFullRaiseTo) this.minRaise = increment;
        p.hasActed = true;
        break;
      }

      case 'allin': {
        const allInAmount = p.stack;
        if (allInAmount === 0) throw new GameError('No chips available');
        this.commit(p, allInAmount);
        const newBet = p.roundBet;
        if (newBet > this.currentBet) {
          const increment = newBet - this.currentBet;
          this.currentBet = newBet;
          this.betCount += 1;
          if (increment >= this.minRaise) this.minRaise = increment;
        }
        p.hasActed = true;
        break;
      }
    }

    p.hasActed = true;
    p.actedAtBet = this.currentBet;
    p.raiseThreshold = this.minRaise;
    const events: EngineEvent[] = [{ type: 'action', seatIndex, action, amount: p.roundBet - beforeBet, street: this.street! }];
    events.push(...this.advance());
    return events;
  }

  // ============ 推进流程 ============

  private advance(): EngineEvent[] {
    const active = this.active();
    if (active.length === 1) {
      return this.endHandNoShowdown(active[0]);
    }
    if (this.noFurtherBetting()) return this.runOutAndShowdown();
    if (this.isStreetEnded()) {
      return this.finishStreet();
    }
    const next = this.nextEligible(this.actionSeatIndex!);
    if (next === null) {
      return this.runOutAndShowdown();
    }
    this.actionSeatIndex = next;
    return [];
  }

  private isStreetEnded(): boolean {
    const elig = this.eligible();
    if (elig.length === 0) return true; // 全部全下
    return elig.every((p) => p.hasActed && p.roundBet === this.currentBet);
  }

  private finishStreet(): EngineEvent[] {
    if (this.street === 'river') {
      return this.showdown();
    }
    // 发公共牌前切（burn）一张：弃掉牌堆顶一张
    this.deck.pop();
    this.burnCount += 1;
    const dealCount = this.street === 'preflop' ? 3 : 1;
    const cards: Card[] = [];
    for (let i = 0; i < dealCount; i++) cards.push(this.deck.pop()!);
    this.board.push(...cards);
    this.street =
      this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : 'river';

    // 重置本轮下注状态
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.betCount = 0;
    for (const p of this.players) {
      p.roundBet = 0;
      p.hasActed = false;
      p.actedAtBet = 0;
      p.raiseThreshold = this.bigBlind;
    }

    // 翻牌后首位行动者 = 按钮左手第一个可行动者（小盲，若未弃牌）
    this.actionSeatIndex = this.nextEligible(this.dealerSeatIndex!);

    const events: EngineEvent[] = [{ type: 'streetDealt', street: this.street, cards }];
    if (this.actionSeatIndex === null) {
      events.push(...this.runOutAndShowdown());
    }
    return events;
  }

  /** 所有人都全下、无后续行动时，直接把牌发完并摊牌 */
  private runOutAndShowdown(): EngineEvent[] {
    const events: EngineEvent[] = [];
    while (this.street && this.street !== 'river') {
      this.deck.pop();
      this.burnCount += 1;
      const dealCount = this.street === 'preflop' ? 3 : 1;
      const cards: Card[] = [];
      for (let i = 0; i < dealCount; i++) cards.push(this.deck.pop()!);
      this.board.push(...cards);
      this.street =
        this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : 'river';
      events.push({ type: 'streetDealt', street: this.street, cards });
    }
    events.push(...this.showdown());
    return events;
  }

  // ============ 摊牌与结算 ============

  /** 依据当前 players + board 计算赢家（公开，便于测试） */
  determineWinners(): { winners: WinnerInfo[]; payouts: Map<number, number> } {
    const active = this.active();
    const pots = this.computePots();
    const payouts = new Map<number, number>();
    const winners: WinnerInfo[] = [];

    for (const [potIndex, pot] of pots.entries()) {
      const contenders = active.filter((p) => pot.eligibleSeatIndexes.includes(p.seatIndex));
      let bestVal = null as ReturnType<typeof evaluateBest> | null;
      let bestSeats: number[] = [];

      for (const p of contenders) {
        const val = evaluateBest([...p.holeCards, ...this.board]);
        const cmp = bestVal === null ? 1 : compareHands(val, bestVal);
        if (cmp > 0) {
          bestVal = val;
          bestSeats = [p.seatIndex];
        } else if (cmp === 0) {
          bestSeats.push(p.seatIndex);
        }
      }

      bestSeats.sort((a, b) => a - b);
      const share = Math.floor(pot.amount / bestSeats.length);
      let remainder = pot.amount - share * bestSeats.length;
      for (const seat of bestSeats) {
        const p = this.getPlayer(seat)!;
        const amt = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        p.stack += amt;
        payouts.set(seat, (payouts.get(seat) ?? 0) + amt);
        winners.push({
          potIndex,
          seatIndex: seat,
          userId: p.userId,
          username: p.username,
          amount: amt,
          handName: describeHand(bestVal!),
          cards: bestFiveCards([...p.holeCards, ...this.board]),
        });
      }
    }

    return { winners, payouts };
  }

  computePots(): PotSlice[] {
    return computeSidePots(
      this.players.map((p) => ({
        seatIndex: p.seatIndex,
        totalBet: p.totalBet,
        hasFolded: p.hasFolded,
      })),
    );
  }

  private showdown(): EngineEvent[] {
    this.status = 'showdown';
    const { winners, payouts } = this.determineWinners();
    this.lastWinners = winners;
    this.soleWinnerSeatIndex = null;
    this.showdownReveals = this.players
      .filter((p) => p.isInHand && !p.hasFolded)
      .map((p) => {
        const val = evaluateBest([...p.holeCards, ...this.board]);
        return {
          seatIndex: p.seatIndex,
          username: p.username,
          holeCards: [...p.holeCards],
          handName: describeHand(val),
          isWinner: payouts.has(p.seatIndex),
          winAmount: payouts.get(p.seatIndex) ?? 0,
        };
      });
    return [{ type: 'showdown', winners }];
  }

  private endHandNoShowdown(winner: EnginePlayer): EngineEvent[] {
    this.status = 'showdown';
    const potTotal = this.players.reduce((sum, p) => sum + p.totalBet, 0);
    winner.stack += potTotal;
    this.lastWinners = [
      {
        seatIndex: winner.seatIndex,
        userId: winner.userId,
        username: winner.username,
        amount: potTotal,
        handName: null,
        cards: [],
      },
    ];
    this.soleWinnerSeatIndex = winner.seatIndex;
    this.showdownReveals = [];
    return [{ type: 'showdown', winners: this.lastWinners }];
  }

  private finishHand(): void {
    this.status = 'handover';
    this.actionSeatIndex = null;
    this.street = null;
    for (const p of this.players) {
      p.isInHand = false;
      p.hasFolded = false;
      p.isAllIn = false;
      p.roundBet = 0;
      p.totalBet = 0;
      p.holeCards = [];
    }
  }

  /** 摊牌确认完成：可选展示唯一赢家的底牌，然后结算本手并进入 handover */
  finalizeShowdown(showWinnerCards = false): EngineEvent[] {
    if (this.status !== 'showdown') return [];
    if (showWinnerCards && this.soleWinnerSeatIndex !== null) {
      const winner = this.getPlayer(this.soleWinnerSeatIndex);
      if (winner && this.lastWinners.length > 0) {
        // 底牌 + 公共牌不足 5 张（如翻牌前全弃牌）时无法评估牌型，只亮出底牌
        const allCards = [...winner.holeCards, ...this.board];
        this.lastWinners[0] = {
          ...this.lastWinners[0],
          handName: allCards.length >= 5 ? describeHand(evaluateBest(allCards)) : null,
          cards: [...winner.holeCards],
        };
      }
    }
    const winners = this.lastWinners;
    this.finishHand();
    this.showdownReveals = [];
    this.soleWinnerSeatIndex = null;
    this.lastWinners = [];
    return [{ type: 'handEnded', winners }];
  }
}
