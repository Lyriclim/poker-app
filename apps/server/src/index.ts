import { Server } from 'socket.io';
import { config } from './config';
import { prisma } from './db';
import { buildApp } from './http/app';
import { TableManager } from './table/manager';
import { setupGateway } from './ws/gateway';

async function main(): Promise<void> {
  const manager = new TableManager();

  const app = buildApp(manager);

  const io = new Server(app.server, {
    cors: { origin: config.clientUrl },
  });
  manager.attachIo(io);
  setupGateway(io, manager);

  // 从数据库恢复未Close的牌桌
  await manager.load();
  await manager.archiveStale();
  const archiveTimer = setInterval(() => void manager.archiveStale(), 60 * 60 * 1000);
  archiveTimer.unref();
  app.addHook('onClose', () => clearInterval(archiveTimer));
  await app.listen({ port: config.port, host: '0.0.0.0' });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.log(`🃏 德州扑克服务已启动：http://localhost:${port}`);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
