import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Table } from '../table';
import { clearActivity, clearHandCheckpoint, loadActivity, loadHandCheckpoint } from '../durable-state';

const db = vi.hoisted(() => ({
  room: { update: vi.fn() }, hand: { findFirst: vi.fn(), create: vi.fn() },
  handAction: { createMany: vi.fn() }, seat: { updateMany: vi.fn() },
  sessionEntry: { updateMany: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock('../../db', () => ({ prisma: db }));

const ids: string[] = [];
afterEach(() => {
  for (const id of ids.splice(0)) { clearHandCheckpoint(id); clearActivity(id); }
  vi.useRealTimers();
});

describe('durable room state', () => {
  it('restores private cards, deck order, committed chips and turn after an interrupted hand', async () => {
    vi.useFakeTimers();
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<void>) => fn(db));
    const id = randomUUID(); ids.push(id);
    const room = { id, name: 'Recovery', smallBlind: 5, bigBlind: 10, maxPlayers: 2, createdBy: 'host' };
    const io = { to: () => ({ emit: vi.fn() }) } as any;
    const original = new Table(io, room);
    original.game.addPlayer('host', 'Host', 0, 100);
    original.game.addPlayer('guest', 'Guest', 1, 100);
    original.startHand();
    original.action('host', 'call');
    const saved = loadHandCheckpoint(id);
    expect(saved?.game.status).toBe('playing');
    expect(saved?.game.handNumber).toBe(1);
    expect(loadActivity(id)).not.toBeNull();

    const restored = new Table(io, room);
    restored.restoreHand(saved!);
    expect(restored.networkPaused).toBe(true);
    expect(restored.game.actionSeatIndex).toBe(original.game.actionSeatIndex);
    expect(restored.game.deck).toEqual(original.game.deck);
    expect(restored.game.players.map((p) => [p.stack, p.totalBet, p.holeCards])).toEqual(
      original.game.players.map((p) => [p.stack, p.totalBet, p.holeCards]));
    expect(restored.game.players.every((p) => !p.isConnected)).toBe(true);
    expect(restored.buildView('host').yourCards).toEqual(original.game.getPlayer(0)?.holeCards);
    expect(restored.buildView('host').players.every((p) => !('holeCards' in p))).toBe(true);
    expect(restored.buildView('spectator').yourCards).toEqual([]);

    for (const userId of ['host', 'guest']) restored.join({ id: userId, join: vi.fn(), emit: vi.fn() } as any, { id: userId, username: userId });
    await restored.control('host', 'resume');
    expect(restored.networkPaused).toBe(false);
    restored.action('guest', 'check');
    expect(restored.game.street).toBe('flop');
  });
  it('recovers an unfinished settlement once after a restart', async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const id = randomUUID(); ids.push(id);
    const room = { id, name: 'Settlement recovery', smallBlind: 5, bigBlind: 10, maxPlayers: 2, createdBy: 'host' };
    const io = { to: () => ({ emit: vi.fn() }) } as any;
    const original = new Table(io, room);
    original.game.addPlayer('host', 'Host', 0, 100);
    original.game.addPlayer('guest', 'Guest', 1, 100);
    for (const p of original.game.players) original.entries.set(p.userId, { userId: p.userId, username: p.username, buyIn: 100, cashOut: 0, rank: null });
    original.startHand();
    original.action('host', 'fold');
    db.$transaction.mockRejectedValueOnce(new Error('disk unavailable'));
    const expectedFailure = vi.spyOn(console, 'error').mockImplementation(() => {});
    original.showHand('guest', false);
    await vi.advanceTimersByTimeAsync(0);
    expectedFailure.mockRestore();
    const saved = loadHandCheckpoint(id);
    expect(saved?.endingWinners).toHaveLength(1);
    expect(saved?.pendingActions).toHaveLength(1);

    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<void>) => fn(db));
    db.hand.findFirst.mockResolvedValue(null);
    db.hand.create.mockResolvedValue({ id: 'saved-hand' });
    const restored = new Table(io, room);
    restored.restoreHand(saved!);
    await restored.resumePendingSettlement();
    expect(db.hand.create).toHaveBeenCalledTimes(1);
    expect(db.handAction.createMany).toHaveBeenCalledTimes(1);
    expect(loadHandCheckpoint(id)).toBeNull();
    expect(restored.game.players.reduce((sum, p) => sum + p.stack, 0)).toBe(200);
  });
});
