import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config';
import type { TableManager } from '../table/manager';
import { registerAuthRoutes } from './routes/auth';
import { registerRoomRoutes } from './routes/rooms';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/server/src/http -> ../../../web/dist = apps/web/dist
const DIST_DIR = path.resolve(__dirname, '../../../web/dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function buildApp(manager: TableManager): FastifyInstance {
  const app = Fastify({ logger: true });

  // 收紧 CORS：仅允许配置的前端来源
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('Access-Control-Allow-Origin', config.clientUrl);
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }
    done();
  });

  app.get('/api/health', async () => ({ ok: true }));

  void registerAuthRoutes(app);
  void registerRoomRoutes(app, manager);

  // 生产模式：托管打包好的前端（dist）+ SPA 回退
  const serveFrontend = (req: FastifyRequest, reply: FastifyReply) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    if (urlPath.startsWith('/api') || urlPath.startsWith('/socket.io')) {
      return reply.code(404).send({ message: 'Not found' });
    }
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    let file = path.resolve(DIST_DIR, rel);
    // 防目录穿越
    if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) {
      return reply.code(403).send();
    }
    if (!path.extname(file) || !existsSync(file) || !statSync(file).isFile()) {
      file = path.join(DIST_DIR, 'index.html'); // SPA 回退
    }
    if (!existsSync(file)) {
      return reply.code(404).send({ message: '前端尚未构建，请先运行 npm run build' });
    }
    reply.header('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    return reply.send(readFileSync(file));
  };
  app.get('/', serveFrontend);
  app.get('/*', serveFrontend);

  return app;
}
