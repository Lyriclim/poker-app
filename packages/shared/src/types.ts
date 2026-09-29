import type { Suit } from './constants';

export interface Card {
  rank: number; // 2..14，14 = Ace
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type HandStatus = 'waiting' | 'playing' | 'showdown' | 'handover';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

/** 每个玩家公开可见的信息（不含手牌） */
export interface PlayerPublic {
  userId: string;
  username: string;
  seatIndex: number;
  stack: number; // 桌上剩余筹码
  roundBet: number; // 本轮已投入
  totalBet: number; // 本手已投入
  hasFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  isConnected: boolean;
  isInHand: boolean; // 是否参与了当前这一手
  isReady: boolean; // 是否已准备（等待开局时）
}

export interface PotSlice {
  amount: number;
  eligibleSeatIndexes: number[];
}

export interface WinnerInfo {
  potIndex?: number;
  seatIndex: number;
  userId: string;
  username: string;
  amount: number;
  handName: string | null; // 无摊牌赢下时为 null
  cards: Card[]; // 摊牌展示的底牌；无摊牌时为空
}

export interface HandResult {
  handNumber: number;
  board: Card[];
  winners: WinnerInfo[];
  totalPot: number;
  pots?: PotSlice[];
}

export interface BlindLevel { smallBlind: number; bigBlind: number }
export interface RoomSettings {
  mode: 'classic' | 'tournament';
  startingStack: number;
  levelMinutes: number;
  levels: BlindLevel[];
}
export interface SessionPlayer {
  userId: string; username: string; buyIn: number; cashOut: number; rank: number | null;
}
export interface SessionSummary extends SessionPlayer { stack: number; net: number }
export interface FunPlayerStats {
  hands: number;
  wins: number;
  showdowns: number;
  biggestGain: number;
  lowestNet: number;
}
export interface SessionAward {
  id: 'collector' | 'showdown' | 'comeback' | 'scoop';
  title: string;
  description: string;
  recipients: { userId: string; username: string; detail: string }[];
}
export interface SessionFun {
  lastRecordedHand: number;
  players: Record<string, FunPlayerStats>;
  awards: SessionAward[];
}
export interface SessionState {
  started: boolean; ended: boolean; paused: boolean; pauseRequested: boolean;
  elapsedMs: number; runningSince: number | null; level: number;
  lastHand: number | null;
  fun: SessionFun;
}

/** 摊牌阶段展示的玩家（含公开手牌） */
export interface ShowdownPlayer {
  seatIndex: number;
  username: string;
  holeCards: Card[]; // 两张底牌
  handName: string; // 最好牌型名，如「两对」
  isWinner: boolean;
  winAmount: number;
}

/** 服务器推给单个玩家的牌桌视图（已做信息隔离） */
export interface TableView {
  networkPaused: boolean;
  actionVersion: string;
  serverNow: number;
  isHost: boolean;
  canRaise: boolean;
  saving: boolean;
  saveError: boolean;
  roomId: string;
  roomName: string;
  settings: RoomSettings;
  session: SessionState;
  nextLevelAt: number | null;
  sessionPlayers: SessionSummary[];
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;

  handNumber: number;
  status: HandStatus;
  street: Street | null;
  board: Card[];

  pots: PotSlice[];
  totalPot: number;
  currentBet: number; // 本轮最高下注
  minRaise: number; // 本轮最小加注增量
  betCount: number; // 本轮下注次数（盲注=1、翻牌后首个下注=1），用于 3-bet / 4-bet 标签
  burnCount: number; // 本手已切（burn）的牌数
  dealerSeatIndex: number | null;
  smallBlindSeatIndex: number | null;
  bigBlindSeatIndex: number | null;
  actionSeatIndex: number | null;

  players: PlayerPublic[];

  yourSeatIndex: number | null;
  yourCards: Card[];

  lastActionText: string | null;

  /** 摊牌阶段信息；null 表示非摊牌阶段 */
  showdown: {
    players: ShowdownPlayer[]; // 已展示手牌的玩家（全弃牌且未展示时为空）
    allFolded: boolean; // 是否只剩一人（其余全弃牌）
    soleWinnerSeatIndex: number | null; // 全弃牌时那个赢家的座位
    deadline: number | null;
  } | null;
}

/** 房间公开信息（大厅列表用） */
export interface RoomPublic {
  id: string;
  name: string;
  mode: 'classic' | 'tournament';
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  status: 'WAITING' | 'PLAYING' | 'PAUSED' | 'CLOSED';
  playerCount: number;
}

export interface AuthUser {
  id: string;
  username: string;
  avatar: string | null;
}

// ============ Socket.IO 事件协议 ============

export interface ClientToServerEvents {
  joinTable: (payload: { roomId: string }) => void;
  sit: (payload: { seatIndex: number; buyIn: number }) => void;
  stand: () => void;
  rebuy: (payload: { amount: number }) => void;
  sessionControl: (payload: { operation: 'start' | 'pause' | 'resume' | 'end' | 'lastHand' | 'cancelLastHand' }) => void;
  removeOffline: (payload: { userId: string }) => void;
  resizeTable: (payload: { maxPlayers: number }) => void;
  retrySave: () => void;
  ready: (payload: { ready: boolean }) => void;
  showHand: (payload: { show: boolean }) => void;
  stillHere: () => void;
  action: (payload: { type: ActionType; amount?: number; roomId: string; actionVersion: string }) => void;
  chat: (payload: { text: string }) => void;
}

export interface ServerToClientEvents {
  tableState: (view: TableView) => void;
  handResult: (result: HandResult) => void;
  afkCheck: (payload: { deadline: number }) => void;
  chat: (msg: ChatMessage) => void;
  error: (payload: { message: string }) => void;
}

export interface ChatMessage {
  username: string;
  text: string;
  at: number;
  seatIndex: number | null; // 发送者座位；观众为 null，用于在座位上显示气泡
}
