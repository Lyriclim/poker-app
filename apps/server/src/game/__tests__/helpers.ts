import type { Card, Suit } from '@poker/shared';

const RANK_MAP: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** 由简写构造单张牌，如 card('As') = 黑桃A、card('10h') = 红心10 */
export function card(s: string): Card {
  const suit = s.slice(-1) as Suit;
  const rankStr = s.slice(0, -1);
  const rank = RANK_MAP[rankStr];
  if (rank === undefined) throw new Error(`无法识别的牌：${s}`);
  return { rank, suit };
}

export function cards(...ss: string[]): Card[] {
  return ss.map(card);
}
