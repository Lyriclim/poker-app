import type { PotSlice } from '@poker/shared';

export interface PotContributor {
  seatIndex: number;
  totalBet: number; // 本手累计投入
  hasFolded: boolean;
}

/**
 * 计算主池与边池（side pots）。
 *
 * 算法：把所有人的投入额从小到大取不同档位，每相邻两档之间构成一层底池；
 * 每层底池只允许「投入额 ≥ 该层阈值」且未弃牌的玩家参与争夺。
 */
export function computeSidePots(players: PotContributor[]): PotSlice[] {
  const contributors = players.filter((p) => p.totalBet > 0);
  const levels = [...new Set(contributors.map((p) => p.totalBet))].sort((a, b) => a - b);

  const pots: PotSlice[] = [];
  let prev = 0;
  for (const level of levels) {
    const involved = players.filter((p) => p.totalBet >= level);
    const eligible = involved
      .filter((p) => !p.hasFolded)
      .map((p) => p.seatIndex)
      .sort((a, b) => a - b);
    const amount = (level - prev) * involved.length;
    if (amount > 0) {
      pots.push({ amount, eligibleSeatIndexes: eligible });
    }
    prev = level;
  }
  return pots;
}
