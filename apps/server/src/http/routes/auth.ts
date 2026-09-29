import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '@poker/shared';
import { prisma } from '../../db';
import { signToken, getUserIdFromHeader } from '../../utils/auth';
import { rateLimit } from '../../utils/rate-limit';

function toAuthUser(u: { id: string; username: string; avatar: string | null }): AuthUser {
  return { id: u.id, username: u.username, avatar: u.avatar };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/enter', async (req, reply) => {
    if (!rateLimit(`enter:${req.ip}`, 30, 10 * 60 * 1000)) {
      return reply.code(429).send({ message: 'Too many attempts. Try again later.' });
    }
    const { username } = (req.body ?? {}) as { username?: unknown };
    if (typeof username !== 'string' || !username.trim()) {
      return reply.code(400).send({ message: 'Enter your name' });
    }
    const name = username.trim();
    if (name.length > 20) {
      return reply.code(400).send({ message: 'Name must be 20 characters or fewer' });
    }

    // The column is retained for existing databases; password login is no longer used.
    const user = await prisma.user.upsert({
      where: { username: name },
      create: { username: name, passwordHash: '' },
      update: {},
    });
    return reply.send({ token: signToken({ userId: user.id, username: user.username }), user: toAuthUser(user) });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ message: 'Please enter your name' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(401).send({ message: 'Player not found' });
    return reply.send(toAuthUser(user));
  });
}
