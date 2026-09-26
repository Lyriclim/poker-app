// 牌的花色与点数相关常量与工具

export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];

// 点数用数字表示：2..14，其中 14 = Ace
export const MIN_RANK = 2;
export const MAX_RANK = 14;

export const SUIT_LABELS: Record<Suit, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

export function rankToLabel(rank: number): string {
  switch (rank) {
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    case 14:
      return 'A';
    default:
      return String(rank);
  }
}

/**
 * 把「本轮第 n 个下注」映射成加注动作名。
 * 2 = raise（首个加注），3 = 3-bet，4 = 4-bet，依此类推。
 */
export function raiseLabel(betCount: number): string {
  if (betCount <= 2) return 'raise';
  if (betCount === 3) return '3-bet';
  if (betCount === 4) return '4-bet';
  return `${betCount}-bet`;
}

// 游戏配置默认值
export const DEFAULT_SMALL_BLIND = 5;
export const DEFAULT_BIG_BLIND = 10;
export const DEFAULT_MAX_PLAYERS = 9;

// 思考多久后弹出「是否还在思考」的挂机检测（毫秒）
export const AFK_CHECK_AFTER_MS = 60_000;
// 挂机检测弹出后，多久未回应则自动弃牌（毫秒）
export const AFK_CHECK_RESPONSE_MS = 20_000;
