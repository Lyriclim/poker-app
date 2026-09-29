import type { Card } from '@poker/shared';
import { rankToLabel } from '@poker/shared';

/**
 * 手牌评估：给定 5~7 张牌，返回最佳 5 张牌型的可比较值。
 *
 * category 越大越强：
 *   9 同花顺  8 四条  7 葫芦  6 同花  5 顺子  4 三条  3 两对  2 一对  1 高牌
 * ranks 为依重要性降序排列的踢脚牌（tiebreaker），用于同类别之间比大小。
 */
export interface HandValue {
  category: number;
  ranks: number[];
}

/** 比较两手牌，返回正数表示 a 更强，负数表示 b 更强，0 表示平局 */
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i++) {
    const av = a.ranks[i] ?? 0;
    const bv = b.ranks[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** 判断 5 张去重后能否构成顺子，返回顺子的最高点数；否则返回 null */
function straightHigh(ranks: number[]): number | null {
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniq.length !== 5) return null;
  // 普通顺子：最高与最低差 4
  if (uniq[0] - uniq[4] === 4) return uniq[0];
  // 轮子顺子 A-2-3-4-5：A 当 5 用
  if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
    return 5;
  }
  return null;
}

/** 评估恰好 5 张牌 */
export function evaluateFive(cards: Card[]): HandValue {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);

  // 按「数量降序、点数降序」整理分组，例如 [[Q,2],[7,1]...]
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const straightTop = straightHigh(ranks);

  // 同花顺
  if (isFlush && straightTop !== null) {
    return { category: 9, ranks: [straightTop] };
  }

  const [r0, c0] = groups[0];
  const [r1, c1] = groups[1] ?? [0, 0];

  // 四条
  if (c0 === 4) {
    return { category: 8, ranks: [r0, r1] };
  }
  // 葫芦
  if (c0 === 3 && c1 === 2) {
    return { category: 7, ranks: [r0, r1] };
  }
  // 同花
  if (isFlush) {
    return { category: 6, ranks };
  }
  // 顺子
  if (straightTop !== null) {
    return { category: 5, ranks: [straightTop] };
  }
  // 三条
  if (c0 === 3) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: 4, ranks: [r0, ...kickers] };
  }
  // 两对
  if (c0 === 2 && c1 === 2) {
    const [hiPair, loPair] = [Math.max(r0, r1), Math.min(r0, r1)];
    const kicker = groups.find((g) => g[1] === 1)?.[0] ?? 0;
    return { category: 3, ranks: [hiPair, loPair, kicker] };
  }
  // 一对
  if (c0 === 2) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: 2, ranks: [r0, ...kickers] };
  }
  // 高牌
  return { category: 1, ranks };
}

/** 生成数组的所有 k 元组合 */
function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const n = arr.length;
  if (k > n) return result;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    result.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return result;
}

/** 从 5~7 张牌中选出最强的 5 张牌型 */
export function evaluateBest(cards: Card[]): HandValue {
  if (cards.length === 5) return evaluateFive(cards);
  let best: HandValue | null = null;
  for (const combo of combinations(cards, 5)) {
    const v = evaluateFive(combo);
    if (best === null || compareHands(v, best) > 0) best = v;
  }
  return best!;
}

/** 返回最强牌型对应的那 5 张牌（用于摊牌展示） */
export function bestFiveCards(cards: Card[]): Card[] {
  if (cards.length === 5) return cards;
  let best: HandValue | null = null;
  let bestCards: Card[] = [];
  for (const combo of combinations(cards, 5)) {
    const v = evaluateFive(combo);
    if (best === null || compareHands(v, best) > 0) {
      best = v;
      bestCards = combo;
    }
  }
  return bestCards;
}

/** Describe the evaluated hand in English. */
export function describeHand(value: HandValue): string {
  const name = (r: number) => rankToLabel(r);
  const [a, b] = [value.ranks[0], value.ranks[1]];
  switch (value.category) {
    case 9:
      return a === 14 ? 'Royal flush' : `Straight flush (${name(a)} high)`;
    case 8:
      return `Four of a kind (${name(a)})`;
    case 7:
      return `Full house (${name(a)} over ${name(b)})`;
    case 6:
      return `Flush (${name(a)} high)`;
    case 5:
      return `Straight (${name(a)} high)`;
    case 4:
      return `Three of a kind (${name(a)})`;
    case 3:
      return `Two pair (${name(a)} and ${name(b)})`;
    case 2:
      return `Pair of ${name(a)}`;
    default:
      return `High card ${name(a)}`;
  }
}
