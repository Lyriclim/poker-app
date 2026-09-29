import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
const db = vi.hoisted(() => ({ room: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, sessionEntry: { create: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../../db', () => ({ prisma: db }));
import { TableManager } from '../manager';
import { clearActivity, clearHandCheckpoint, saveActivity } from '../durable-state';

function fixture() {
  return { id: 'closed', name: 'Complete', smallBlind: 5, bigBlind: 10, maxPlayers: 2, createdBy: 'host', status: 'CLOSED',
    settings: '{}', session: '{}', entries: [{ userId: 'host', username: 'Host', buyIn: 100, cashOut: 100, rank: null }],
    hands: [{ handNumber: 5 }], seats: [{ userId: 'host', seatIndex: 0, stack: 100, user: { id: 'host', username: 'Host' } }] };
}
function manager() {
  const m = new TableManager(); m.attachIo({ to: () => ({ emit: vi.fn() }) } as any); return m;
}
beforeEach(() => { vi.clearAllMocks(); db.$transaction.mockImplementation(async (fn) => fn(db)); });
afterEach(() => { for (const id of ['room', 'closed']) { clearHandCheckpoint(id); clearActivity(id); } });

describe('Completed table lifecycle', () => {
  it('permits a safe restart only when no hand or player connection is active', () => {
    const m = manager();
    const table = m.create({ id: 'room', name: 'Test', smallBlind: 5, bigBlind: 10, maxPlayers: 2, createdBy: 'host' });
    expect(m.canRestart()).toBe(true);
    table.join({ id: 'watcher', join: vi.fn(), emit: vi.fn() } as any, { id: 'viewer', username: 'Viewer' });
    expect(m.canRestart()).toBe(false);
    table.handleDisconnect('watcher');
    table.game.addPlayer('host', 'Host', 0, 100);
    table.game.addPlayer('guest', 'Guest', 1, 100);
    table.startHand();
    expect(m.canRestart()).toBe(false);
  });
  it('archives an unvisited room after 24 hours while preserving its settled chips', async () => {
    const now = Date.now();
    const id = `old-${now}`;
    clearActivity(id);
    db.room.findMany.mockResolvedValue([{ ...fixture(), id, status: 'WAITING', createdAt: new Date(now - 25 * 60 * 60 * 1000),
      entries: [{ ...fixture().entries[0], cashOut: 0 }], hands: [],
      seats: [{ ...fixture().seats[0], joinedAt: new Date(now - 25 * 60 * 60 * 1000) }] }]);
    const m = manager(); await m.load(); await m.archiveStale(now);
    expect(db.room.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id }, data: expect.objectContaining({ status: 'CLOSED' }) }));
    expect(db.sessionEntry.updateMany).toHaveBeenCalledWith({ where: { roomId: id, userId: 'host' }, data: { cashOut: 100, rank: null } });
    expect(m.list()).toEqual([]);
    clearActivity(id);
  });
  it('keeps a recently visited room after restart even when its last hand is old', async () => {
    const id = `recent-${Date.now()}`;
    const now = Date.now();
    saveActivity(id, now - 60_000);
    try {
      db.room.findMany.mockResolvedValue([{ ...fixture(), id, status: 'WAITING', createdAt: new Date(now - 30 * 60 * 60 * 1000),
        hands: [{ handNumber: 1, createdAt: new Date(now - 30 * 60 * 60 * 1000) }],
        seats: [{ ...fixture().seats[0], joinedAt: new Date(now - 30 * 60 * 60 * 1000) }] }]);
      const m = manager(); await m.load(); await m.archiveStale(now);
      expect(m.get(id)).toBeDefined();
      expect(db.room.update).not.toHaveBeenCalled();
    } finally { clearActivity(id); }
  });
  it('replays a committed result after restart when its original broadcast was missed', async () => {
    const id = `settled-${Date.now()}`;
    const hand = { handNumber: 3, board: '[]', pot: 15, winners: JSON.stringify([
      { seatIndex: 1, userId: 'guest', username: 'Guest', amount: 15, handName: null, cards: [] },
    ]) };
    db.room.findMany.mockResolvedValue([{ ...fixture(), id, status: 'WAITING', hands: [hand],
      entries: [{ userId: 'host', username: 'Host', buyIn: 100, cashOut: 0, rank: null },
        { userId: 'guest', username: 'Guest', buyIn: 100, cashOut: 0, rank: null }],
      seats: [{ userId: 'host', seatIndex: 0, stack: 95, user: { id: 'host', username: 'Host' } },
        { userId: 'guest', seatIndex: 1, stack: 105, user: { id: 'guest', username: 'Guest' } }] }]);
    try {
      const m = manager(); await m.load();
      const table = m.get(id)!;
      expect(table.game.status).toBe('handover');
      const emit = vi.fn();
      table.join({ id: 'returning-host', join: vi.fn(), emit } as any, { id: 'host', username: 'Host' });
      expect(emit).toHaveBeenCalledWith('handResult', expect.objectContaining({ handNumber: 3, totalPot: 15 }));
    } finally { clearHandCheckpoint(id); clearActivity(id); }
  });
  it('loads the latest unfinished hand instead of reverting to previous seat balances', async () => {
    vi.useFakeTimers();
    const id = `hand-${Date.now()}`;
    try {
      const original = manager().create({ id, name: 'Live', smallBlind: 5, bigBlind: 10, maxPlayers: 2, createdBy: 'host' });
      original.game.addPlayer('host', 'Host', 0, 100);
      original.game.addPlayer('guest', 'Guest', 1, 100);
      for (const p of original.game.players) original.entries.set(p.userId, { userId: p.userId, username: p.username, buyIn: 100, cashOut: 0, rank: null });
      original.startHand();
      original.action('host', 'call');
      db.room.findMany.mockResolvedValue([{ ...fixture(), id, name: 'Live', status: 'WAITING', hands: [], entries: [...original.entries.values()],
        createdAt: new Date(), seats: [
          { userId: 'host', seatIndex: 0, stack: 100, joinedAt: new Date(), user: { id: 'host', username: 'Host' } },
          { userId: 'guest', seatIndex: 1, stack: 100, joinedAt: new Date(), user: { id: 'guest', username: 'Guest' } },
        ] }]);
      const restarted = manager(); await restarted.load();
      const recovered = restarted.get(id)!;
      expect(recovered.game.status).toBe('playing');
      expect(recovered.game.players.map((p) => p.stack)).toEqual(original.game.players.map((p) => p.stack));
      expect(recovered.game.players.map((p) => p.holeCards)).toEqual(original.game.players.map((p) => p.holeCards));
      expect(recovered.networkPaused).toBe(true);
    } finally { clearHandCheckpoint(id); clearActivity(id); vi.useRealTimers(); }
  });
  it('does not load completed tables on startup', async () => {
    db.room.findMany.mockResolvedValue([]);
    const m = manager(); await m.load();
    expect(db.room.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { not: 'CLOSED' } } }));
    expect(m.list()).toEqual([]);
  });

  it('deduplicates result loading, restores results and releases the last viewer', async () => {
    db.room.findUnique.mockResolvedValue(fixture());
    const m = manager(); const [a, b] = await Promise.all([m.resolve('closed'), m.resolve('closed')]);
    expect(a).toBe(b); expect(db.room.findUnique).toHaveBeenCalledTimes(1);
    expect(a!.buildView('host')).toMatchObject({ handNumber: 5, session: { ended: true }, sessionPlayers: [{ cashOut: 100, net: 0 }] });
    a!.join({ id: 'socket', join: vi.fn(), emit: vi.fn() } as any, { id: 'host', username: 'Host' });
    a!.handleDisconnect('socket'); expect(m.get('closed')).toBeUndefined();
    expect(await m.resolve('closed')).not.toBe(a);
  });
});
