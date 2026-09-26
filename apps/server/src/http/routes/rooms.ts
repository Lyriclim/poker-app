import type { FastifyInstance } from 'fastify';
import { DEFAULT_BIG_BLIND, DEFAULT_MAX_PLAYERS, DEFAULT_SMALL_BLIND } from '@poker/shared';
import { prisma } from '../../db';
import { getUserIdFromHeader } from '../../utils/auth';
import { generateInviteCode } from '../../utils/invite';
import type { TableManager } from '../../table/manager';

export async function registerRoomRoutes(app: FastifyInstance, manager: TableManager): Promise<void> {
  app.post('/api/rooms', async (req, reply) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ message: '未登录' });

    const body = (req.body ?? {}) as {
      name?: string;
      smallBlind?: number;
      bigBlind?: number;
      maxPlayers?: number;
    };
    const smallBlind = clampInt(body.smallBlind, DEFAULT_SMALL_BLIND, 1, 100000);
    const bigBlind = clampInt(body.bigBlind, DEFAULT_BIG_BLIND, smallBlind, 1000000);
    const maxPlayers = clampInt(body.maxPlayers, DEFAULT_MAX_PLAYERS, 2, 9);
    const name = (body.name ?? '').trim().slice(0, 30) || `朋友桌 ${smallBlind}/${bigBlind}`;

    const inviteCode = generateInviteCode();
    const room = await prisma.room.create({
      data: {
        name,
        inviteCode,
        smallBlind,
        bigBlind,
        maxPlayers,
        status: 'WAITING',
        createdBy: userId,
      },
    });

    const table = manager.create(room);
    return reply.send(table.toPublic());
  });

  app.get('/api/rooms', async (req, reply) => {
    if (!getUserIdFromHeader(req.headers.authorization)) {
      return reply.code(401).send({ message: '未登录' });
    }
    return manager.list().map((t) => t.toPublic());
  });

  app.get('/api/rooms/:inviteCode', async (req, reply) => {
    if (!getUserIdFromHeader(req.headers.authorization)) {
      return reply.code(401).send({ message: '未登录' });
    }
    const { inviteCode } = req.params as { inviteCode: string };
    const existing = manager
      .list()
      .find((t) => t.inviteCode.toUpperCase() === inviteCode.toUpperCase());
    if (existing) return reply.send(existing.toPublic());
    return reply.code(404).send({ message: '房间不存在或已关闭' });
  });
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
