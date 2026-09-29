import type { FastifyInstance } from 'fastify';
import { DEFAULT_BIG_BLIND, DEFAULT_MAX_PLAYERS, DEFAULT_SMALL_BLIND } from '@poker/shared';
import { prisma } from '../../db';
import { getUserIdFromHeader } from '../../utils/auth';
import type { TableManager } from '../../table/manager';
import { validateSettings } from '../../table/session';

export async function registerRoomRoutes(app: FastifyInstance, manager: TableManager): Promise<void> {
  app.post('/api/rooms', async (req, reply) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ message: 'Please sign in' });

    const body = (req.body ?? {}) as {
      name?: string;
      smallBlind?: number;
      bigBlind?: number;
      maxPlayers?: number;
      settings?: unknown;
    };
    const smallBlind = clampInt(body.smallBlind, DEFAULT_SMALL_BLIND, 1, 100000);
    const bigBlind = clampInt(body.bigBlind, DEFAULT_BIG_BLIND, smallBlind, 1000000);
    const maxPlayers = clampInt(body.maxPlayers, DEFAULT_MAX_PLAYERS, 2, 9);
    const name = (typeof body.name === 'string' ? body.name : '').trim().slice(0, 30) || `Friends table ${smallBlind}/${bigBlind}`;
    let settings;
    try { settings = validateSettings(body.settings, smallBlind, bigBlind); }
    catch (err) { return reply.code(400).send({ message: (err as Error).message }); }

    const room = await prisma.room.create({
      data: {
        name,
        smallBlind,
        bigBlind,
        maxPlayers,
        status: 'WAITING',
        createdBy: userId,
        settings: JSON.stringify(settings),
      },
    });

    const table = manager.create(room);
    return reply.send(table.toPublic());
  });

  app.get('/api/rooms', async (req, reply) => {
    if (!getUserIdFromHeader(req.headers.authorization)) {
      return reply.code(401).send({ message: 'Please sign in' });
    }
    return manager.list().filter((t) => !t.session.ended).map((t) => t.toPublic());
  });

}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, Math.floor(value)));
}
