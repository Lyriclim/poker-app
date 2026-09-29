import type { HandResult, SessionPlayer, SessionState } from '@poker/shared';
import { prisma } from '../db';

export interface Settlement {
  roomId: string;
  result: HandResult;
  actions: { playerId: string; seatIndex: number; action: string; amount: number; street: string }[];
  seats: { userId: string; stack: number }[];
  entries: SessionPlayer[];
  session: SessionState;
}

/** Persist the same immutable snapshot on every retry. */
export async function saveSettlement({ roomId, result, actions, seats, entries, session }: Settlement): Promise<void> {
  const totalPot = result.totalPot;
  await prisma.$transaction(async (tx) => {
    // A previous attempt may have committed even if its acknowledgement was lost.
    // The full hand is written in one transaction, so an existing key means it is complete.
    const existing = await tx.hand.findFirst({
      where: { roomId, handNumber: result.handNumber },
      select: { id: true },
    });
    if (existing) return;
    const hand = await tx.hand.create({
      data: {
        roomId: roomId,
        handNumber: result.handNumber,
        board: JSON.stringify(result.board),
        pot: totalPot,
        winners: JSON.stringify(result.winners),
      },
    });
    if (actions.length > 0) {
      await tx.handAction.createMany({
        data: actions.map((a) => ({
          handId: hand.id,
          playerId: a.playerId,
          seatIndex: a.seatIndex,
          action: a.action,
          amount: a.amount,
          street: a.street,
        })),
      });
    }
    for (const p of seats) {
      await tx.seat.updateMany({
        where: { roomId: roomId, userId: p.userId },
        data: { stack: p.stack },
      });
    }
    for (const entry of entries) {
      await tx.sessionEntry.updateMany({ where: { roomId: roomId, userId: entry.userId }, data: { rank: entry.rank, cashOut: entry.cashOut } });
    }
    await tx.room.update({ where: { id: roomId }, data: { session: JSON.stringify(session), status: session.ended ? 'CLOSED' : 'WAITING' } });
  });
}
