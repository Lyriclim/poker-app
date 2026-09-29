import { PrismaClient } from '@prisma/client';
import { unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { setTimeout as delay } from 'node:timers/promises';

const database = resolve('apps/server/prisma', `network-qa-${randomUUID()}.db`);
const source = new PrismaClient({ datasources: { db: { url: `file:${resolve('apps/server/prisma/dev.db').replaceAll('\\', '/')}` } } });
await source.$executeRawUnsafe(`VACUUM INTO '${database.replaceAll('\\', '/').replaceAll("'", "''")}'`);
await source.$disconnect();
process.env.DATABASE_URL = `file:${database.replaceAll('\\', '/')}`;
process.env.JWT_SECRET = randomUUID();
const { prisma } = await import('../apps/server/src/db.ts');
const { TableManager } = await import('../apps/server/src/table/manager.ts');
const { buildApp } = await import('../apps/server/src/http/app.ts');
const { setupGateway } = await import('../apps/server/src/ws/gateway.ts');
const { signToken } = await import('../apps/server/src/utils/auth.ts');
const manager = new TableManager();
const app = buildApp(manager);
const server = new Server(app.server);
manager.attachIo(server); setupGateway(server, manager);
await app.listen({ host: '127.0.0.1', port: 0 });
const port = (app.server.address() as { port: number }).port;
const clients: ReturnType<typeof connect>[] = [];
const views: any[] = [];
const samples: number[] = [];
let unexpectedDisconnects = 0;
let expectedDisconnect = false;
const command = (index: number, event: string, payload = {}) => new Promise<void>((yes, no) => {
  clients[index].timeout(5000).emit(event, payload, (error: Error | null, ack: any) => error || !ack?.ok ? no(error ?? Error(ack?.message)) : yes());
});
const waitFor = async (predicate: () => boolean) => { for(let i=0;i<100;i++){if(predicate()) return;await delay(50);} throw Error('State timeout'); };
try {
  const users = [];
  for(let i=0;i<8;i++) users.push(await prisma.user.create({ data: { username: `qa-${randomUUID()}`, passwordHash: 'unused' } }));
  const rooms = [];
  for(let i=0;i<2;i++) { const room = await prisma.room.create({data:{name:'Network QA', createdBy:users[i*4].id,maxPlayers:4}}); rooms.push(manager.create(room)); }
  for(let i=0;i<8;i++) {
    const socket = connect(`http://127.0.0.1:${port}`, { auth:{token:signToken({ userId: users[i].id, username: users[i].username })}, autoConnect:false, reconnection:false });
    clients.push(socket);
    socket.on('tableState', (view) => { views[i]=view; });
    socket.on('disconnect', () => { if(!expectedDisconnect) unexpectedDisconnects++; });
    const connected = new Promise<void>((yes,no)=>{socket.once('connect',yes);socket.once('connect_error',no);}); socket.connect();await connected;
    await command(i,'joinTable',{roomId:rooms[Math.floor(i/4)].id});
    await command(i,'sit',{seatIndex:i%4,buyIn:1000});
  }
  for(let i=0;i<8;i++) await command(i,'ready',{ready:true});
  await waitFor(()=>views.every(v=>v.status==='playing'));
  const cards = views.map(v=>JSON.stringify(v.yourCards));
  const chips = rooms.map(t=>JSON.stringify(t.game.players.map(p=>[p.stack,p.totalBet])));
  expectedDisconnect=true;
  for(const socket of clients) socket.io.engine.close();
  await waitFor(()=>rooms.every(t=>t.networkPaused));
  await delay(1000);
  for(const socket of clients) socket.connect();
  await waitFor(()=>clients.every(s=>s.connected));
  for(let i=0;i<8;i++) await command(i,'joinTable',{roomId:rooms[Math.floor(i/4)].id});
  await waitFor(()=>rooms.every(t=>t.game.players.every(p=>p.isConnected)));
  assert.deepEqual(views.map(v=>JSON.stringify(v.yourCards)),cards);
  assert.deepEqual(rooms.map(t=>JSON.stringify(t.game.players.map(p=>[p.stack,p.totalBet]))),chips);
  for(let i=0;i<2;i++) await command(i*4,'sessionControl',{operation:'resume'});
  await waitFor(()=>views.every(v=>!v.networkPaused));
  expectedDisconnect=false;
  for(let round=0;round<60;round++) {
    await Promise.all(clients.map(async(_,i)=>{const began=performance.now();await command(i,'connectionCheck');samples.push(performance.now()-began);}));
    // Keep the table active without changing the hand, exercising authenticated AFK responses.
    if(round===40) for(let i=0;i<8;i++) await command(i,'stillHere');
    await delay(1000);
  }
  assert.equal(unexpectedDisconnects,0);
  assert(rooms.every(t=>t.game.status==='playing'));
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({ok:true,clients:8,tables:2,probes:samples.length,unexpectedDisconnects,p50Ms:Math.round(samples[Math.floor(samples.length*.5)]),p95Ms:Math.round(samples[Math.floor(samples.length*.95)]),restoredCardsAndChips:true,scope:'localhost only; not an ngrok route test'}));
} finally {
  expectedDisconnect=true;
  clients.forEach(s=>s.disconnect());
  await new Promise<void>(done=>server.close(()=>done()));
  await app.close(); await prisma.$disconnect();
  for(const suffix of ['', '-journal', '-wal', '-shm']) if(existsSync(database+suffix)) unlinkSync(database+suffix);
}
process.exit(0);

