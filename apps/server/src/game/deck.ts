import { randomInt } from 'node:crypto';
import type { Card, Suit } from '@poker/shared';
import { SUITS, MAX_RANK, MIN_RANK } from '@poker/shared';

/** 创建一副 52 张牌 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS as readonly Suit[]) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** 默认使用密码学安全的随机数（CSPRNG），比 Math.random 更适合牌局 */
export function secureRandom(): number {
  return randomInt(0, 2 ** 32) / 2 ** 32;
}

/** Fisher–Yates 洗牌（原地洗，返回同一数组） */
export function shuffle<T>(arr: T[], rng: () => number = secureRandom): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
