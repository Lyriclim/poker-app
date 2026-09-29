import type { Server } from 'socket.io';
import { prisma } from '../db';
import { Table } from './table';
import { clearHandCheckpoint, loadActivity, loadHandCheckpoint } from './durable-state';
import type { Prisma } from '@prisma/client';
import type { Card, HandResult, WinnerInfo } from '@poker/shared';

const roomInclude = {
  seats: { include: { user: true } }, entries: true,
  hands: { orderBy: { handNumber: 'desc' as const }, take: 1 }
} as const;
type LoadedRoom = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;
const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;

/** 全局牌桌注册表：roomId -> 运行中的 Table */
export class TableManager {
  io!: Server;
  private tables = new Map<string, Table>();
  private loading = new Map<string, Promise<Table | undefined>>();

  attachIo(io: Server): void {
    this.io = io;
  }

  get(roomId: string): Table | undefined {
    return this.tables.get(roomId);
  }

  create(room: {
    id: string;
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    createdBy: string;
    settings?: string;
    session?: string;
    status?: string;
  }): Table {
    const table = new Table(this.io, room);
    table.onClosedIdle = () => { if (this.tables.get(room.id) === table) this.remove(room.id); };
    this.tables.set(room.id, table);
    return table;
  }

  remove(roomId: string): void {
    this.tables.delete(roomId);
  }

  list(): Table[] {
    return [...this.tables.values()];
  }

  canRestart(): boolean {
    return [...this.tables.values()].every((table) => table.canRestart());
  }

  /** Restore open rooms and resume a checkpointed hand when one exists. */
  async load(): Promise<void> {
    const rooms = await prisma.room.findMany({
      where: { status: { not: 'CLOSED' } }, include: roomInclude,
    });
    for (const room of rooms) await this.hydrate(room);
  }

  /** Close rooms idle for a day without interrupting connected players or a live hand. */
  async archiveStale(now = Date.now()): Promise<void> {
    const cutoff = now - ARCHIVE_AFTER_MS;
    for (const table of [...this.tables.values()]) {
      if (!table.canArchive(cutoff)) continue;
      try {
        await table.control(table.createdBy, 'end');
        console.info(JSON.stringify({ event: 'room.archived', at: new Date(now).toISOString(), roomId: table.id }));
      } catch (error) {
        console.error('Could not archive idle room', table.id, error);
      }
    }
  }

  /** Completed tables are loaded only when someone opens their results. */
  async resolve(roomId: string): Promise<Table | undefined> {
    const inFlight = this.loading.get(roomId);
    if (inFlight) return inFlight;
    const existing = this.get(roomId);
    if (existing) return existing;
    let pending = this.loading.get(roomId);
    if (!pending) {
      pending = (async () => {
        const room = await prisma.room.findUnique({ where: { id: roomId }, include: roomInclude });
        return room ? this.hydrate(room) : undefined;
      })();
      this.loading.set(roomId, pending);
    }
    try { return await pending; } catch (error) { this.tables.delete(roomId); throw error; } finally { this.loading.delete(roomId); }
  }

  private async hydrate(room: LoadedRoom): Promise<Table> {
    const table = this.create(room);
    const timestamps = [room.createdAt, room.hands[0]?.createdAt, ...room.seats.map((seat) => seat.joinedAt)]
      .filter((value): value is Date => value instanceof Date).map((value) => value.getTime());
    const persistedActivity = loadActivity(room.id);
    if (timestamps.length || persistedActivity) table.restoreLastActivity(new Date(Math.max(persistedActivity ?? 0, ...timestamps)));
    for (const entry of room.entries) table.entries.set(entry.userId, { userId: entry.userId, username: entry.username, buyIn: entry.buyIn, cashOut: entry.cashOut, rank: entry.rank });
    const lastHand = room.hands[0];
    table.game.handNumber = lastHand?.handNumber ?? 0;
    for (const seat of room.seats) {
      const user = seat.user;
      if (user) {
        table.game.addPlayer(user.id, user.username, seat.seatIndex, seat.stack);
        table.game.getPlayer(seat.seatIndex)!.isConnected = false;
        // Upgrade existing seats into this session's ledger without resetting chips.
        if (!table.entries.has(user.id)) {
          const entry = { userId: user.id, username: user.username, buyIn: seat.stack, cashOut: table.session.ended ? seat.stack : 0, rank: null };
          await prisma.sessionEntry.create({ data: { roomId: room.id, ...entry } });
          table.entries.set(user.id, entry);
        }
      }
    }
    const saved = loadHandCheckpoint(room.id);
    let resumedHand = false;
    if (saved) {
      if (room.status === 'CLOSED' || (lastHand?.handNumber ?? 0) >= saved.game.handNumber) {
        clearHandCheckpoint(room.id);
      } else {
        resumedHand = true;
        table.restoreHand(saved);
        table.game.maxPlayers = room.maxPlayers;
        const seated = new Set(room.seats.map((seat) => seat.userId));
        for (const player of [...table.game.players]) {
          if (!seated.has(player.userId) && !player.isInHand) table.game.removePlayer(player.seatIndex);
        }
        for (const seat of room.seats) {
          if (!table.game.players.some((player) => player.userId === seat.userId) && seat.user) {
            table.game.addPlayer(seat.userId, seat.user.username, seat.seatIndex, seat.stack);
            table.game.getPlayer(seat.seatIndex)!.isConnected = false;
          }
        }
        for (const entry of room.entries) table.entries.set(entry.userId, { userId: entry.userId, username: entry.username, buyIn: entry.buyIn, cashOut: entry.cashOut, rank: entry.rank });
        await table.resumePendingSettlement();
      }
    }
    // Settlement is committed before its result is emitted. Rebuild the last
    // result from the committed hand if the process stopped in that gap.
    if (!resumedHand && room.status !== 'CLOSED' && lastHand?.board && lastHand.winners) {
      try {
        const board = JSON.parse(lastHand.board) as Card[];
        const winners = JSON.parse(lastHand.winners) as WinnerInfo[];
        if (Array.isArray(board) && Array.isArray(winners)) {
          const pots = Array.from({ length: Math.max(1, ...winners.map((winner) => (winner.potIndex ?? 0) + 1)) }, (_, index) => ({
            amount: winners.filter((winner) => (winner.potIndex ?? 0) === index).reduce((sum, winner) => sum + winner.amount, 0),
            eligibleSeatIndexes: winners.filter((winner) => (winner.potIndex ?? 0) === index).map((winner) => winner.seatIndex),
          }));
          const result: HandResult = { handNumber: lastHand.handNumber, board, winners, totalPot: lastHand.pot, pots };
          table.restoreLastHandResult(result);
        }
      } catch (error) { console.error('Could not restore the last hand result', room.id, error); }
    }
    return table;
  }
}
