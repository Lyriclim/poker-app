import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() }, seat: { create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  room: { update: vi.fn() }, hand: { create: vi.fn(), findFirst: vi.fn() }, handAction: { createMany: vi.fn() }, $transaction: vi.fn(),
  sessionEntry: { upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('../../db', () => ({ prisma: db }));
vi.mock('../durable-state', () => ({ saveActivity: vi.fn(), saveHandCheckpoint: vi.fn(), clearHandCheckpoint: vi.fn() }));
import { Table } from '../table';

function makeTable() {
  const emit = vi.fn();
  const t = new Table({ to: () => ({ emit }) } as any, { id: 'room', name: 'Test', smallBlind: 5, bigBlind: 10, maxPlayers: 3, createdBy: 'host' });
  t.game.addPlayer('host', 'Host', 0, 100);
  t.game.addPlayer('guest', 'Guest', 1, 100);
  for (const p of t.game.players) t.entries.set(p.userId, { userId: p.userId, username: p.username, buyIn: p.stack, cashOut: 0, rank: null });
  return { t, emit };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  db.user.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, username: where.id }));
  db.hand.create.mockResolvedValue({ id: 'hand' });
  db.hand.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (fn) => fn(db));
});
afterEach(() => vi.useRealTimers());

describe('Table lifecycle', () => {
  it('sends one fresh view when an already connected player rejoins', () => {
    const { t } = makeTable();
    const emit = vi.fn();
    const socket = { id: 'host-tab', join: vi.fn(), emit } as any;
    t.join(socket, { id: 'host', username: 'Host' });
    emit.mockClear();
    t.join(socket, { id: 'host', username: 'Host' });
    expect(emit.mock.calls.filter(([event]) => event === 'tableState')).toHaveLength(1);
  });
  it('replays an unresolved result after reconnect and deals only after both players continue', async () => {
    const { t } = makeTable();
    t.startHand(); t.action('host', 'fold'); t.showHand('guest', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.game.status).toBe('handover');
    const hostEmit = vi.fn();
    t.join({ id: 'host-return', join: vi.fn(), emit: hostEmit } as any, { id: 'host', username: 'Host' });
    expect(hostEmit.mock.calls.some(([event]) => event === 'handResult')).toBe(true);
    t.setReady('host', true);
    expect(t.game.handNumber).toBe(1);
    t.handleDisconnect('host-return');
    expect(t.game.getPlayer(0)?.isReady).toBe(true);
    expect(t.networkPaused).toBe(false);
    const otherTab = vi.fn();
    t.join({ id: 'host-tab', join: vi.fn(), emit: otherTab } as any, { id: 'host', username: 'Host' });
    expect(otherTab.mock.calls.some(([event]) => event === 'handResult')).toBe(false);
    t.setReady('guest', true);
    expect(t.game.handNumber).toBe(2);
    expect(t.game.status).toBe('playing');
  });
  it('freezes timed blinds while everyone is away between hands and resumes on return', async () => {
    const { t } = makeTable();
    t.settings.levels = [{ smallBlind: 5, bigBlind: 10 }, { smallBlind: 10, bigBlind: 20 }];
    t.startHand(); t.action('host', 'fold'); t.showHand('guest', false);
    await vi.advanceTimersByTimeAsync(0);
    const join = (id: string, userId: string) => t.join({ id, join: vi.fn(), emit: vi.fn() } as any, { id: userId, username: userId });
    join('h', 'host'); join('g', 'guest');
    t.setReady('host', true);
    t.handleDisconnect('h'); t.handleDisconnect('g');
    expect(t.networkPaused).toBe(false);
    expect(t.session.paused).toBe(true);
    const elapsed = t.buildView('host').session.elapsedMs;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.buildView('host').session.elapsedMs).toBe(elapsed);
    join('h-again', 'host');
    expect(t.session.paused).toBe(false);
    expect(t.game.getPlayer(0)?.isReady).toBe(true);
  });
  it('holds cards, chips and the blind clock while everyone is offline, until the host resumes', async () => {
    const { t } = makeTable();
    const join = (id: string, userId: string) => t.join({ id, join: vi.fn(), emit: vi.fn() } as any, { id: userId, username: userId });
    join('h', 'host'); join('g', 'guest'); join('watch', 'spectator');
    t.startHand();
    await vi.advanceTimersByTimeAsync(10_000);
    const cards = t.game.players.map((p) => [...p.holeCards]);
    const stacks = t.game.players.map((p) => [p.stack, p.totalBet]);
    t.handleDisconnect('h'); expect(t.networkPaused).toBe(false);
    t.handleDisconnect('g'); expect(t.networkPaused).toBe(true);
    const clock = t.buildView('host').session.elapsedMs;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(t.game.status).toBe('playing');
    expect(t.game.players.map((p) => p.holeCards)).toEqual(cards);
    expect(t.game.players.map((p) => [p.stack, p.totalBet])).toEqual(stacks);
    expect(t.buildView('host').session.elapsedMs).toBe(clock);
    join('h2', 'host');
    expect(() => t.action('host', 'fold')).toThrow('held');
    await expect(t.control('host', 'resume')).rejects.toThrow('two players');
    join('g2', 'guest');
    await expect(t.control('guest', 'resume')).rejects.toThrow('host');
    db.$transaction.mockRejectedValueOnce(new Error('disk'));
    await expect(t.control('host', 'resume')).rejects.toThrow('disk');
    expect(t.networkPaused).toBe(true);
    await t.control('host', 'resume');
    expect(t.networkPaused).toBe(false);
    expect(t.session.paused).toBe(false);
    t.action('host', 'call'); expect(t.game.actionSeatIndex).toBe(1);
  });

  it('preserves the remaining showdown window and counts multiple connections per player', async () => {
    const { t } = makeTable();
    const join = (id: string, userId: string) => t.join({ id, join: vi.fn(), emit: vi.fn() } as any, { id: userId, username: userId });
    join('h', 'host'); join('h-tab', 'host'); join('g', 'guest');
    t.startHand(); t.action('host', 'fold');
    await vi.advanceTimersByTimeAsync(4_000);
    t.handleDisconnect('g'); t.handleDisconnect('h');
    expect(t.networkPaused).toBe(false);
    t.handleDisconnect('h-tab'); expect(t.networkPaused).toBe(true);
    expect(t.buildView('host').showdown?.deadline).toBeNull();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.game.status).toBe('showdown'); expect(db.hand.create).not.toHaveBeenCalled();
    join('h2', 'host'); join('g2', 'guest'); await t.control('host', 'resume');
    await vi.advanceTimersByTimeAsync(999); expect(t.game.status).toBe('showdown');
    await vi.advanceTimersByTimeAsync(1); expect(t.game.status).toBe('handover');
    expect(db.hand.create).toHaveBeenCalledTimes(1);
  });
  it('marks the current hand as last, closes after saving and cannot pay out twice', async () => {
    const { t } = makeTable(); t.startHand();
    await t.control('host','lastHand');
    expect(t.session.lastHand).toBe(1); expect(t.session.ended).toBe(false);
    t.action('host','fold'); expect(t.session.ended).toBe(false);
    t.showHand('guest',false); await vi.advanceTimersByTimeAsync(0);
    expect(t.session.ended).toBe(true);
    expect(t.entries.get('guest')!.cashOut).toBe(105);
    expect(t.session.fun.awards.find((award)=>award.id==='scoop')?.recipients[0].userId).toBe('guest');
    expect(JSON.parse(db.room.update.mock.calls.at(-1)![0].data.session)).toMatchObject({ended:true,lastHand:1,fun:{lastRecordedHand:1}});
    await t.stand('guest'); expect(t.entries.get('guest')!.cashOut).toBe(105);
    expect(()=>t.setReady('host',true)).toThrow('ended');
  });

  it('marks the next hand while waiting and permits the host to cancel', async () => {
    const { t }=makeTable();
    await expect(t.control('guest','lastHand')).rejects.toThrow('host');
    await t.control('host','lastHand'); expect(t.session.lastHand).toBe(1);
    await t.control('host','cancelLastHand'); expect(t.session.lastHand).toBeNull();
    t.startHand(); t.action('host','fold'); t.showHand('guest',false); await vi.advanceTimersByTimeAsync(0);
    expect(t.session.ended).toBe(false);
    await t.control('host','lastHand'); expect(t.session.lastHand).toBe(2);
    t.startHand(); t.action('guest','fold'); t.showHand('host',false); await vi.advanceTimersByTimeAsync(0);
    expect(t.session.ended).toBe(true); expect(t.session.fun.lastRecordedHand).toBe(2);
  });

  it('retains the final marker across restoration and rolls it back on save failure', async () => {
    const { t }=makeTable(); await t.control('host','lastHand');
    const restored=new Table({to:()=>({emit:vi.fn()})} as any,{id:'room',name:'Test',smallBlind:5,bigBlind:10,maxPlayers:3,createdBy:'host',session:JSON.stringify(t.session)});
    expect(restored.session.lastHand).toBe(1); expect(restored.session.fun.players).toEqual({});
    db.$transaction.mockRejectedValueOnce(new Error('disk'));
    await expect(t.control('host','cancelLastHand')).rejects.toThrow('disk');
    expect(t.session.lastHand).toBe(1);
    t.settings.mode='tournament'; await expect(t.control('host','lastHand')).rejects.toThrow('Classic');
  });

  it('retries final settlement without duplicating highlights or cash-outs', async () => {
    const errorLog=vi.spyOn(console,'error').mockImplementation(()=>{});
    const { t }=makeTable(); t.startHand(); await t.control('host','lastHand');
    db.$transaction.mockRejectedValueOnce(new Error('disk'));
    t.action('host','fold'); t.showHand('guest',false); await vi.advanceTimersByTimeAsync(0);
    expect(t.buildView('host').saveError).toBe(true);
    const awards=JSON.stringify(t.session.fun.awards);
    await t.retrySave('host');
    expect(t.session.fun.players.guest.hands).toBe(1); expect(t.entries.get('guest')!.cashOut).toBe(105);
    expect(JSON.stringify(t.session.fun.awards)).toBe(awards);
    expect(t.buildView('host').saveError).toBe(false); errorLog.mockRestore();
  });
  it('rejects delayed or duplicate actions and versions from another server instance', () => {
    const { t } = makeTable(); t.startHand();
    const version = t.actionVersion;
    t.action('host', 'call', 0, version);
    expect(() => t.action('guest', 'check', 0, version)).toThrow('table has changed');
    expect(t.game.actionSeatIndex).toBe(1);
    const other = makeTable().t; other.startHand();
    expect(() => other.action('host', 'fold', 0, version)).toThrow('table has changed');
  });

  it('retries the captured settlement rather than changed live ledger values', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { t } = makeTable(); t.startHand();
    db.$transaction.mockRejectedValueOnce(new Error('disk'));
    t.action('host', 'fold'); t.showHand('guest', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.buildView('host').saveError).toBe(true);
    t.entries.get('host')!.cashOut = 999;
    db.sessionEntry.updateMany.mockClear();
    await t.retrySave('host');
    expect(db.sessionEntry.updateMany).toHaveBeenCalledWith({ where: { roomId: 'room', userId: 'host' }, data: { rank: null, cashOut: 0 } });
    errorLog.mockRestore();
  });
  it('waits for a concurrent seat mutation before saving settlement balances', async () => {
    const { t } = makeTable(); t.startHand();
    let release!: () => void;
    db.$transaction.mockImplementationOnce(async (fn) => { await new Promise<void>((resolve) => { release=resolve; }); return fn(db); });
    const seating=t.sit('new',2,137);
    await vi.advanceTimersByTimeAsync(0);
    t.action('host','fold'); t.showHand('guest',false);
    expect(t.buildView('host').saving).toBe(true); expect(()=>t.setReady('host',true)).toThrow('settlement');
    release(); await seating; await vi.advanceTimersByTimeAsync(5);
    expect(db.seat.updateMany).toHaveBeenCalledWith({where:{roomId:'room',userId:'new'},data:{stack:137}});
    expect(t.game.getPlayer(2)!.stack).toBe(137); expect(t.buildView('host').saving).toBe(false);
  });
  it('retains elapsed blind time when cancelling a pending pause', async () => {
    const { t } = makeTable(); t.startHand(); await vi.advanceTimersByTimeAsync(20_000);
    await t.control('host','pause'); await vi.advanceTimersByTimeAsync(10_000); await t.control('host','resume');
    expect(t.buildView('host').session.elapsedMs).toBe(30_000);
  });
  it('includes disconnected tournament players in blinds without requiring ready', async () => {
    const { t } = makeTable(); t.settings.mode='tournament'; t.session.started=true;
    t.game.getPlayer(1)!.isConnected=false; t.setReady('host',true);
    expect(t.game.status).toBe('playing'); expect(t.game.getPlayer(1)!.isInHand).toBe(true);
    expect(t.game.getPlayer(1)!.roundBet).toBe(10);
  });
  it('does not double-count awarded chips during showdown', () => {
    const { t }=makeTable(); t.startHand(); t.action('host','fold');
    expect(t.buildView('host').sessionPlayers.reduce((sum,p)=>sum+p.net,0)).toBe(0);
  });
  it('removes withdrawn tournament registrations before the tournament starts', async () => {
    const { t }=makeTable(); t.settings.mode='tournament'; await t.stand('guest');
    expect(t.entries.has('guest')).toBe(false); expect(db.sessionEntry.deleteMany).toHaveBeenCalled();
  });
  it('rebuys in the same empty seat, records chips and prevents repeated top-ups', async () => {
    const { t } = makeTable(); t.game.getPlayer(1)!.stack = 0;
    await t.rebuy('guest', 137);
    expect(t.game.getPlayer(1)!.stack).toBe(137);
    expect(t.entries.get('guest')!.buyIn).toBe(237);
    await expect(t.rebuy('guest', 50)).rejects.toThrow('gone');
    t.game.getPlayer(1)!.stack = 0;
    for (const amount of [0, -1, 1.5, NaN, Infinity]) await expect(t.rebuy('guest', amount)).rejects.toThrow();
  });
  it('holds the next hand for a newly busted player and treats rebuy as ready', async () => {
    const { t } = makeTable();
    t.startHand();
    t.game.getPlayer(0)!.stack = 0;
    t.action('host', 'fold'); t.showHand('guest', false);
    await vi.advanceTimersByTimeAsync(0);
    t.setReady('guest', true);
    expect(t.game.handNumber).toBe(1);
    db.$transaction.mockRejectedValueOnce(new Error('disk'));
    await expect(t.rebuy('host', 137)).rejects.toThrow('disk');
    expect(t.game.handNumber).toBe(1);
    expect(t.game.getPlayer(0)!.stack).toBe(0);
    await t.rebuy('host', 137);
    expect(t.entries.get('host')!.buyIn).toBe(237);
    expect(t.game.handNumber).toBe(2);
    expect(t.game.getPlayer(0)!.isInHand).toBe(true);
    await expect(t.rebuy('host', 50)).rejects.toThrow('gone');
  });
  it('lets ready players continue when a newly busted player leaves or disconnects', async () => {
    for (const departure of ['stand', 'disconnect'] as const) {
      const { t } = makeTable();
      t.game.addPlayer('third', 'Third', 2, 100);
      t.entries.set('third', { userId: 'third', username: 'Third', buyIn: 100, cashOut: 0, rank: null });
      if (departure === 'disconnect') t.join({ id: 'host-tab', join: vi.fn(), emit: vi.fn() } as any, { id: 'host', username: 'Host' });
      t.startHand();
      t.game.getPlayer(0)!.stack = 0;
      t.action('host', 'fold'); t.action('guest', 'fold'); t.showHand('third', false);
      await vi.advanceTimersByTimeAsync(0);
      t.setReady('guest', true); t.setReady('third', true);
      expect(t.game.handNumber).toBe(1);
      if (departure === 'stand') await t.stand('host');
      else t.handleDisconnect('host-tab');
      expect(t.game.handNumber).toBe(2);
      expect(t.game.getPlayer(1)!.isInHand).toBe(true);
      expect(t.game.getPlayer(2)!.isInHand).toBe(true);
    }
  });
  it('keeps the old stack and ledger if a rebuy cannot save', async () => {
    const { t } = makeTable(); t.game.getPlayer(1)!.stack = 0;
    db.$transaction.mockRejectedValueOnce(new Error('disk'));
    await expect(t.rebuy('guest', 50)).rejects.toThrow('disk');
    expect(t.game.getPlayer(1)!.stack).toBe(0); expect(t.entries.get('guest')!.buyIn).toBe(100);
  });
  it('cash-outs only once and preserves ledger across re-seating', async () => {
    const { t } = makeTable(); await t.stand('guest'); await t.sit('guest', 1, 80);
    expect(t.entries.get('guest')).toMatchObject({ buyIn: 180, cashOut: 100 });
    await t.control('host','end');
    expect(t.buildView('guest').sessionPlayers.find((p) => p.userId === 'guest')!.net).toBe(0);
    await t.stand('guest'); expect(t.entries.get('guest')!.cashOut).toBe(180);
    await expect(t.sit('new', 1, 100)).rejects.toThrow('ended');
  });
  it('pauses a live session after settlement, and freezes blind time', async () => {
    const { t } = makeTable(); t.startHand(); await t.control('host', 'pause');
    expect(t.session.paused).toBe(false); expect(t.session.pauseRequested).toBe(true);
    t.action('host','fold'); t.showHand('guest',false); await vi.advanceTimersByTimeAsync(0);
    expect(t.session.paused).toBe(true); const elapsed = t.buildView('host').session.elapsedMs;
    await vi.advanceTimersByTimeAsync(120_000); expect(t.buildView('host').session.elapsedMs).toBe(elapsed);
    await t.control('host','resume'); expect(t.session.paused).toBe(false);
  });
  it('changes blind levels only on the next hand', async () => {
    const { t } = makeTable(); t.settings.levels = [{ smallBlind:5,bigBlind:10 },{ smallBlind:10,bigBlind:20 }]; t.settings.levelMinutes=1;
    t.startHand(); await vi.advanceTimersByTimeAsync(61_000); expect(t.bigBlind).toBe(10);
    t.action('host','fold'); t.showHand('guest',false); await vi.advanceTimersByTimeAsync(0); t.startHand();
    expect(t.bigBlind).toBe(20); expect(t.game.minRaise).toBe(20);
  });
  it('requires host tournament start and forbids late entries and rebuys', async () => {
    const { t } = makeTable(); t.settings.mode='tournament';
    t.setReady('host',true); t.setReady('guest',true); expect(t.game.status).toBe('waiting');
    await expect(t.control('guest','start')).rejects.toThrow('host');
    await t.control('host','start'); expect(t.game.status).toBe('playing');
    await expect(t.sit('new',2,100)).rejects.toThrow('started');
    await expect(t.rebuy('guest',100)).rejects.toThrow('Classic');
  });
  it('uses equal tournament stacks and determines a champion after a bust', async () => {
    const { t } = makeTable(); t.settings.mode='tournament'; t.settings.startingStack=321;
    await t.sit('third',2,999); expect(t.game.getPlayer(2)!.stack).toBe(321);
    t.game.removePlayer(2); t.entries.delete('third');
    t.session.started=true; t.startHand();
    t.game.getPlayer(0)!.holeCards=[{rank:14,suit:'c'},{rank:14,suit:'s'}]; t.game.getPlayer(1)!.holeCards=[{rank:13,suit:'h'},{rank:13,suit:'d'}];
    t.game.deck=[{rank:2,suit:'c'},{rank:3,suit:'d'},{rank:4,suit:'h'},{rank:5,suit:'s'},{rank:7,suit:'c'},{rank:8,suit:'d'},{rank:9,suit:'h'},{rank:10,suit:'s'}];
    t.action('host','allin'); t.action('guest','call');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.session.ended).toBe(true); expect(t.entries.get('host')!.rank).toBe(1); expect(t.entries.get('guest')!.rank).toBe(2);
  });
  it('shows a short automatic showdown without a skip action', async () => {
    const { t, emit } = makeTable();
    t.join({ id: 'socket', join: vi.fn(), emit: vi.fn() } as any, { id: 'host', username: 'Host' });
    t.startHand();
    while (t.game.status === 'playing') {
      const p = t.game.getPlayer(t.game.actionSeatIndex!)!;
      t.action(p.userId, p.roundBet === t.game.currentBet ? 'check' : 'call');
    }
    expect(t.game.status).toBe('showdown');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(t.game.status).toBe('showdown');
    await vi.advanceTimersByTimeAsync(1);
    expect(t.game.status).toBe('handover');
    expect(emit.mock.calls.some(([event]) => event === 'handResult')).toBe(true);
  });
  it('allows mid-hand seating without dealing cards to the newcomer', async () => {
    const { t } = makeTable(); t.startHand();
    await t.sit('new', 2, 100);
    expect(t.game.getPlayer(2)?.isInHand).toBe(false);
    expect(t.buildView('new').yourCards).toEqual([]);
  });
  it('restricts resizing to the host and protects occupied seats', async () => {
    const { t } = makeTable();
    await expect(t.resize('guest', 9)).rejects.toThrow('host');
    await t.resize('host', 9);
    expect(t.game.maxPlayers).toBe(9);
    t.game.addPlayer('last', 'Last', 8, 100);
    await expect(t.resize('host', 8)).rejects.toThrow('occupied');
    t.startHand(); await expect(t.resize('host', 7)).rejects.toThrow('between hands');
  });
  it('rejects invalid buy-ins before writing the database', async () => {
    const { t } = makeTable();
    for (const buyIn of [0, -1, 10.5, Infinity, NaN]) await expect(t.sit('new', 2, buyIn)).rejects.toThrow();
    await expect(t.sit('new', 3, 100)).rejects.toThrow('seat');
    expect(db.seat.create).not.toHaveBeenCalled();
  });
  it('automatically mucks after the winner does not respond', async () => {
    const { t, emit } = makeTable(); t.startHand(); t.action('host', 'fold');
    expect(t.game.status).toBe('showdown');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(t.game.status).toBe('handover');
    const result = emit.mock.calls.find(([event]) => event === 'handResult')?.[1];
    expect(result.winners[0].cards).toEqual([]);
    expect(db.$transaction).toHaveBeenCalledOnce();
  });
  it('settles without confirmations from offline or newly seated players', async () => {
    const { t } = makeTable(); t.startHand();
    while (t.game.status === 'playing') {
      const p = t.game.getPlayer(t.game.actionSeatIndex!)!;
      t.action(p.userId, p.roundBet === t.game.currentBet ? 'check' : 'call');
    }
    await t.sit('new', 2, 100);
    t.game.getPlayer(1)!.isConnected = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.game.status).toBe('handover');
    await vi.advanceTimersByTimeAsync(0);
  });
  it('starts with online funded players only', () => {
    const { t } = makeTable(); t.game.addPlayer('offline', 'Offline', 2, 100); t.game.getPlayer(2)!.isConnected = false;
    t.setReady('host', true); t.setReady('guest', true);
    expect(t.game.status).toBe('playing');
    expect(t.game.getPlayer(2)?.isInHand).toBe(false);
  });
  it('locks new hands while settlement saves, then supports retry on failure', async () => {
    const { t } = makeTable();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.$transaction.mockRejectedValueOnce(new Error('disk busy'));
    t.startHand(); t.action('host', 'fold'); t.showHand('guest', false);
    expect(t.buildView('host').saving).toBe(true);
    expect(() => t.setReady('host', true)).toThrow('settlement');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.buildView('host').saveError).toBe(true);
    await t.retrySave('host');
    expect(t.buildView('host').saveError).toBe(false);
    expect(db.handAction.createMany).toHaveBeenCalledOnce();
    expect(db.handAction.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ handId: 'hand', playerId: 'host', action: 'fold' })] });
    log.mockRestore();
  });
  it('accepts a hand already committed by a previous save attempt without writing it again', async () => {
    const { t, emit } = makeTable();
    db.hand.findFirst.mockResolvedValueOnce({ id: 'already-saved' });
    t.startHand(); t.action('host', 'fold'); t.showHand('guest', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(db.hand.create).not.toHaveBeenCalled();
    expect(db.handAction.createMany).not.toHaveBeenCalled();
    expect(emit.mock.calls.some(([event]) => event === 'handResult')).toBe(true);
  });
  it('never exposes an opponent hole card before showdown', () => {
    const { t } = makeTable(); t.startHand();
    expect(t.buildView('spectator').yourCards).toEqual([]);
    expect(t.buildView('host').yourCards).toHaveLength(2);
    expect(t.buildView('host').players.every((p) => !('holeCards' in p))).toBe(true);
  });
});

