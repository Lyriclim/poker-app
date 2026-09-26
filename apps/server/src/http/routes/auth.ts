import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '@poker/shared';
import { prisma } from '../../db';
import { hashPassword, verifyPassword, signToken, getUserIdFromHeader } from '../../utils/auth';
import { config } from '../../config';
import { rateLimit } from '../../utils/rate-limit';

function toAuthUser(u: {
  id: string;
  username: string;
  avatar: string | null;
}): AuthUser {
  return { id: u.id, username: u.username, avatar: u.avatar };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', async (req, reply) => {
    if (!rateLimit(`register:${req.ip}`, 10, 10 * 60 * 1000)) {
      return reply.code(429).send({ message: '注册尝试过于频繁，请稍后再试' });
    }
    const { username, password, registerCode } = (req.body ?? {}) as {
      username?: string;
      password?: string;
      registerCode?: string;
    };

    // 若配置了注册邀请码，则必须提供正确的码
    if (config.registerCode && registerCode !== config.registerCode) {
      return reply.code(403).send({ message: '注册邀请码错误' });
    }

    if (!username || !password) {
      return reply.code(400).send({ message: '用户名和密码不能为空' });
    }
    const name = username.trim();
    if (name.length < 2 || name.length > 20) {
      return reply.code(400).send({ message: '用户名长度需在 2~20 之间' });
    }
    if (password.length < 6) {
      return reply.code(400).send({ message: '密码至少 6 位' });
    }

    const exists = await prisma.user.findUnique({ where: { username: name } });
    if (exists) {
      return reply.code(409).send({ message: '用户名已存在' });
    }

    const user = await prisma.user.create({
      data: {
        username: name,
        passwordHash: hashPassword(password),
      },
    });

    const token = signToken({ userId: user.id, username: user.username });
    return reply.send({ token, user: toAuthUser(user) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    if (!rateLimit(`login:${req.ip}`, 10, 10 * 60 * 1000)) {
      return reply.code(429).send({ message: '登录尝试过于频繁，请稍后再试' });
    }
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    if (!username || !password) {
      return reply.code(400).send({ message: '用户名和密码不能为空' });
    }
    const user = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ message: '用户名或密码错误' });
    }
    const token = signToken({ userId: user.id, username: user.username });
    return reply.send({ token, user: toAuthUser(user) });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const userId = getUserIdFromHeader(req.headers.authorization);
    if (!userId) return reply.code(401).send({ message: '未登录' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(401).send({ message: '用户不存在' });
    return reply.send(toAuthUser(user));
  });
}
