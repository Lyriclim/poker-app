import type { Server } from 'socket.io';
import { prisma } from '../db';
import { Table } from './table';

/** 全局牌桌注册表：roomId -> 运行中的 Table */
export class TableManager {
  io!: Server;
  private tables = new Map<string, Table>();

  attachIo(io: Server): void {
    this.io = io;
  }

  get(roomId: string): Table | undefined {
    return this.tables.get(roomId);
  }

  create(room: {
    id: string;
    name: string;
    inviteCode: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
  }): Table {
    const table = new Table(this.io, room);
    this.tables.set(room.id, table);
    return table;
  }

  remove(roomId: string): void {
    this.tables.delete(roomId);
  }

  list(): Table[] {
    return [...this.tables.values()];
  }

  /** 启动时从数据库恢复尚未关闭的牌桌（进行中的一手会从下一手重新开始） */
  async load(): Promise<void> {
    const rooms = await prisma.room.findMany({
      where: { status: { not: 'CLOSED' } },
      include: { seats: true },
    });
    for (const room of rooms) {
      const table = this.create(room);
      for (const seat of room.seats) {
        const user = await prisma.user.findUnique({ where: { id: seat.userId } });
        if (user) {
          table.game.addPlayer(user.id, user.username, seat.seatIndex, seat.stack);
        }
      }
    }
  }
}
