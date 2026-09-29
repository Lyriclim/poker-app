import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
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

async function isFile(file: string): Promise<boolean> {
  try { return (await stat(file)).isFile(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return false;
    throw error;
  }
}

function acceptsGzip(header: string | undefined): boolean {
  return (header ?? '').split(',').some((part) => {
    const [coding, ...parameters] = part.trim().split(';');
    if (coding.trim().toLowerCase() !== 'gzip') return false;
    const quality = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith('q='));
    return quality === undefined || Number(quality.trim().slice(2)) > 0;
  });
}

export function buildApp(manager: TableManager): FastifyInstance {
  const app = Fastify({ logger: true });
  const startedAt = Date.now();

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

  app.get('/api/health', async () => ({ ok: true, restartSafe: manager.canRestart(), pid: process.pid, startedAt }));

  void registerAuthRoutes(app);
  void registerRoomRoutes(app, manager);

  // 生产模式：托管打包好的前端（dist）+ SPA 回退
  const serveFrontend = async (req: FastifyRequest, reply: FastifyReply) => {
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
    if (!path.extname(file) || !(await isFile(file))) {
      file = path.join(DIST_DIR, 'index.html'); // SPA 回退
    }
    if (!(await isFile(file))) {
      return reply.code(404).send({ message: 'Frontend not built. Run npm run build first.' });
    }
    const extension = path.extname(file).toLowerCase();
    const hashedAsset = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(urlPath) && file !== path.join(DIST_DIR, 'index.html');
    reply.header('Cache-Control', hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
    reply.header('Content-Type', MIME[extension] ?? 'application/octet-stream');
    const source = createReadStream(file);
    const compressible = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);
    if (compressible.has(extension) && acceptsGzip(String(req.headers['accept-encoding'] ?? ''))) {
      reply.header('Content-Encoding', 'gzip');
      reply.header('Vary', 'Accept-Encoding');
      const gzip = createGzip();
      source.on('error', (error) => gzip.destroy(error));
      return reply.send(source.pipe(gzip));
    }
    if (compressible.has(extension)) reply.header('Vary', 'Accept-Encoding');
    return reply.send(source);
  };
  app.get('/', serveFrontend);
  app.get('/*', serveFrontend);

  return app;
}
