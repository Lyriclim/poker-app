import type { SessionPlayer, SessionState } from '@poker/shared';
import { prisma } from '../db';

export async function saveSeat(roomId: string, userId: string, username: string, seatIndex: number, buyIn: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.seat.create({ data: { roomId, userId, seatIndex, stack: buyIn, status: 'SEATED' } });
    await tx.sessionEntry.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, username, buyIn }, update: { buyIn: { increment: buyIn } }
    });
  });
}

export async function cashOutSeat(roomId: string, userId: string, stack: number, withdraw: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.seat.deleteMany({ where: { roomId, userId } });
    if (withdraw) await tx.sessionEntry.deleteMany({ where: { roomId, userId } });
    else await tx.sessionEntry.updateMany({ where: { roomId, userId }, data: { cashOut: { increment: stack } } });
  });
}

export async function saveRebuy(roomId: string, userId: string, amount: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.seat.updateMany({ where: { roomId, userId }, data: { stack: amount } });
    await tx.sessionEntry.updateMany({ where: { roomId, userId }, data: { buyIn: { increment: amount } } });
  });
}

export async function saveSession(roomId: string, session: SessionState, entries: SessionPlayer[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.room.update({
      where: { id: roomId }, data: {
        session: JSON.stringify(session), status: session.ended ? 'CLOSED' : session.paused ? 'PAUSED' : 'WAITING',
      }
    });
    if (session.ended) for (const entry of entries) {
      await tx.sessionEntry.updateMany({ where: { roomId, userId: entry.userId }, data: { cashOut: entry.cashOut, rank: entry.rank } });
    }
  });
}
