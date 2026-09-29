import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const db = vi.hoisted(() => ({ user: { upsert: vi.fn(), findUnique: vi.fn() } }));
vi.mock('../../db', () => ({ prisma: db }));

import { registerAuthRoutes } from '../routes/auth';
import { verifyToken } from '../../utils/auth';

const apps: ReturnType<typeof Fastify>[] = [];
async function app() {
  const server = Fastify();
  apps.push(server);
  await registerAuthRoutes(server);
  return server;
}
afterEach(async () => { await Promise.all(apps.splice(0).map((server) => server.close())); vi.clearAllMocks(); });

describe('name-only entry', () => {
  it('creates a player once and returns the same identity for the same name', async () => {
    const users = new Map<string, { id: string; username: string; avatar: null }>();
    db.user.upsert.mockImplementation(async ({ where, create }) => {
      const existing = users.get(where.username);
      if (existing) return existing;
      expect(create.passwordHash).toBe('');
      const user = { id: `player-${users.size + 1}`, username: create.username, avatar: null };
      users.set(user.username, user);
      return user;
    });
    db.user.findUnique.mockImplementation(async ({ where }) => [...users.values()].find((user) => user.id === where.id));
    const server = await app();
    const first = await server.inject({ method: 'POST', url: '/api/auth/enter', payload: { username: ' 阿明 ' } });
    const again = await server.inject({ method: 'POST', url: '/api/auth/enter', payload: { username: '阿明' } });
    expect(first.statusCode).toBe(200);
    expect(again.statusCode).toBe(200);
    expect(users.size).toBe(1);
    expect(first.json().user).toEqual({ id: 'player-1', username: '阿明', avatar: null });
    expect(verifyToken(again.json().token).userId).toBe('player-1');
    const me = await server.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${again.json().token}` } });
    expect(me.json().username).toBe('阿明');
  });

  it('rejects empty or overlong names and has no password endpoints', async () => {
    const server = await app();
    for (const username of ['', '  ', 'x'.repeat(21)]) {
      const response = await server.inject({ method: 'POST', url: '/api/auth/enter', payload: { username } });
      expect(response.statusCode).toBe(400);
    }
    expect(db.user.upsert).not.toHaveBeenCalled();
    expect((await server.inject({ method: 'POST', url: '/api/auth/login', payload: {} })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: '/api/auth/register', payload: {} })).statusCode).toBe(404);
  });
});
