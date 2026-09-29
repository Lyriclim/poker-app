import { describe, it, expect } from 'vitest';
import { PokerGame } from '../engine';

function game(stacks: number[]) {
  const g = new PokerGame({ smallBlind: 5, bigBlind: 10, maxPlayers: 9 });
  stacks.forEach((stack, i) => g.addPlayer(`u${i}`, `P${i}`, i, stack));
  g.startHand();
  return g;
}

describe('Poker rule regressions', () => {
  it('runs out when the heads-up small blind is already all-in', () => {
    const g = game([5, 100]);
    expect(g.status).toBe('showdown');
    expect(g.board).toHaveLength(5);
    expect(g.players.reduce((n, p) => n + p.stack, 0)).toBe(105);
  });
  it('runs out when both blinds are all-in', () => {
    const g = game([5, 10]);
    expect(g.status).toBe('showdown');
    expect(g.board).toHaveLength(5);
  });
  it('still requires the remaining player to call an all-in', () => {
    const g = game([100, 10]);
    expect(g.status).toBe('playing');
    expect(g.canRaise(0)).toBe(false);
    g.applyAction(0, 'call');
    expect(g.status).toBe('showdown');
    expect(g.players.reduce((n, p) => n + p.stack, 0)).toBe(110);
  });
  it('short big blind does not lower the multiway bring-in', () => {
    const g = game([100, 100, 3]);
    expect(g.currentBet).toBe(10);
    expect(g.actionSeatIndex).toBe(0);
  });
  it('does not reopen a raise after a short all-in', () => {
    const g = game([1000, 25, 1000]);
    g.applyAction(0, 'raise', 20);
    g.applyAction(1, 'allin');
    g.applyAction(2, 'call');
    expect(g.actionSeatIndex).toBe(0);
    expect(g.canRaise(0)).toBe(false);
    expect(() => g.applyAction(0, 'raise', 40)).toThrow('not reopened');
    expect(() => g.applyAction(0, 'allin')).toThrow('not reopened');
    g.applyAction(0, 'call');
    expect(g.street).toBe('flop');
  });
  it('reopens after cumulative short raises equal a full raise', () => {
    const g = game([25, 30, 1000, 1000]);
    g.applyAction(3, 'raise', 20);
    g.applyAction(0, 'allin');
    g.applyAction(1, 'allin');
    g.applyAction(2, 'call');
    expect(g.canRaise(3)).toBe(true);
    g.applyAction(3, 'raise', 40);
    expect(g.currentBet).toBe(40);
  });
  it('allows the big blind to raise after calls', () => {
    const g = game([100, 100, 100]);
    g.applyAction(0, 'call'); g.applyAction(1, 'call');
    expect(g.canRaise(2)).toBe(true);
    g.applyAction(2, 'raise', 25);
    expect(g.minRaise).toBe(15);
  });
  it('keeps a mid-hand arrival out of the current hand', () => {
    const g = game([100, 100]);
    g.addPlayer('new', 'New', 2, 100);
    expect(g.getPlayer(2)?.isInHand).toBe(false);
    expect(g.getPlayer(2)?.holeCards).toHaveLength(0);
    g.applyAction(0, 'fold'); g.finalizeShowdown(); g.startHand();
    expect(g.getPlayer(2)?.isInHand).toBe(true);
  });
  it('rejects non-integer amounts and invalid actions without changing chips', () => {
    const g = game([100, 100]);
    for (const amount of [NaN, Infinity, -1, 20.5]) expect(() => g.applyAction(0, 'raise', amount)).toThrow();
    expect(() => g.applyAction(0, 'invalid' as any)).toThrow();
    expect(g.getPlayer(0)?.stack).toBe(95);
  });
  it('excludes offline players from the next hand', () => {
    const g = game([100, 100, 100]);
    g.applyAction(0, 'fold'); g.applyAction(1, 'fold'); g.finalizeShowdown();
    g.getPlayer(0)!.isConnected = false; g.startHand();
    expect(g.getPlayer(0)?.isInHand).toBe(false);
  });
  it('rejects invalid seats and duplicate users', () => {
    const g = game([100, 100]);
    for (const seat of [-1, 9, 1.5]) expect(() => g.addPlayer('new', 'New', seat, 100)).toThrow();
    expect(() => g.addPlayer('u0', 'Duplicate', 2, 100)).toThrow();
  });
  it('records actual call and all-in contributions', () => {
    const g = game([100, 100]);
    const call = g.applyAction(0, 'call').find((e) => e.type === 'action');
    expect(call?.amount).toBe(5);
    const allin = g.applyAction(1, 'allin').find((e) => e.type === 'action');
    expect(allin?.amount).toBe(90);
  });
});
