import { describe, it, expect } from 'vitest';
import { computeSidePots } from '../pots';

describe('边池计算', () => {
  it('无全下时只有一个主池', () => {
    const pots = computeSidePots([
      { seatIndex: 0, totalBet: 100, hasFolded: false },
      { seatIndex: 1, totalBet: 100, hasFolded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(200);
    expect(pots[0].eligibleSeatIndexes).toEqual([0, 1]);
  });

  it('一人短码全下，切出主池与边池', () => {
    const pots = computeSidePots([
      { seatIndex: 0, totalBet: 50, hasFolded: false },
      { seatIndex: 1, totalBet: 100, hasFolded: false },
      { seatIndex: 2, totalBet: 100, hasFolded: false },
    ]);
    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(150); // 50 * 3
    expect(pots[0].eligibleSeatIndexes).toEqual([0, 1, 2]);
    expect(pots[1].amount).toBe(100); // 50 * 2
    expect(pots[1].eligibleSeatIndexes).toEqual([1, 2]);
  });

  it('弃牌的玩家不计入边池资格', () => {
    const pots = computeSidePots([
      { seatIndex: 0, totalBet: 100, hasFolded: true },
      { seatIndex: 1, totalBet: 100, hasFolded: false },
    ]);
    expect(pots[0].amount).toBe(200);
    expect(pots[0].eligibleSeatIndexes).toEqual([1]);
  });
});
