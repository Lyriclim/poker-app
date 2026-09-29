import type { Server } from 'socket.io';
import type { ActionType } from '@poker/shared';
import { verifyToken } from '../utils/auth';
import { prisma } from '../db';
import type { TableManager } from '../table/manager';

export function setupGateway(io: Server, manager: TableManager): void {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('Enter your name to continue');
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) throw new Error('Enter your name again');
      socket.data.userId = user.id;
      socket.data.username = user.username;
      next();
    } catch { next(new Error('Session expired. Enter your name again.')); }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const logConnection = (event: string, reason?: string) => console.info(JSON.stringify({ event, at: new Date().toISOString(), userId, socketId: socket.id, roomId: socket.data.tableId, transport: socket.conn.transport.name, reason }));
    logConnection('socket.connected');
    socket.conn.on('upgrade', () => logConnection('socket.upgraded'));
    const table = () => manager.get(socket.data.tableId ?? '');
    let windowStarted = Date.now();
    let messages = 0;
    const handle = (name: string, fn: (payload: any) => unknown) => {
      socket.on(name, async (payload, ack?: (result: { ok: boolean; message?: string }) => void) => {
        if (Date.now() - windowStarted >= 1000) { windowStarted = Date.now(); messages = 0; }
        if (++messages > 80) {
          if (typeof ack === 'function') ack({ ok: false, message: 'Too many requests. Please slow down.' });
          else if (messages === 81) socket.emit('error', { message: 'Too many requests. Please slow down.' });
          return;
        }
        try { await fn(payload); if (typeof ack === 'function') ack({ ok: true }); }
        catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to complete this action';
          if (typeof ack === 'function') ack({ ok: false, message });
          else socket.emit('error', { message });
        }
      });
    };
    const requireTable = () => {
      const t = table();
      if (!t) throw new Error('Join a table first');
      return t;
    };
    handle('joinTable', async (payload) => {
      if (typeof payload?.roomId !== 'string') throw new Error('Invalid room');
      const t = await manager.resolve(payload.roomId);
      if (!socket.connected) return;
      if (!t) throw new Error('Room not found or closed');
      const old = table();
      if (old && old.id !== t.id) {
        old.handleDisconnect(socket.id);
        void socket.leave(`room:${old.id}`);
      }
      socket.data.tableId = t.id;
      t.join(socket, { id: userId, username: socket.data.username });
    });
    handle('sit', (p) => requireTable().sit(userId, p?.seatIndex, p?.buyIn));
    handle('connectionCheck', () => undefined);
    handle('stand', () => requireTable().stand(userId));
    handle('rebuy', (p) => requireTable().rebuy(userId, p?.amount));
    handle('sessionControl', (p) => requireTable().control(userId, p?.operation));
    handle('removeOffline', (p) => requireTable().removeOffline(userId, p?.userId));
    handle('resizeTable', (p) => requireTable().resize(userId, p?.maxPlayers));
    handle('retrySave', () => requireTable().retrySave(userId));
    handle('ready', (p) => requireTable().setReady(userId, p?.ready));
    handle('showHand', (p) => {
      if (typeof p?.show !== 'boolean') throw new Error('Invalid show-hand choice');
      requireTable().showHand(userId, p.show);
    });
    handle('stillHere', () => requireTable().stillHere(userId));
    handle('action', (p) => {
      const t = requireTable();
      if (p?.roomId !== t.id || typeof p?.actionVersion !== 'string') throw new Error('Refresh this table before acting.');
      t.action(userId, p?.type as ActionType, p?.amount ?? 0, p.actionVersion);
    });
    let lastChat = 0;
    handle('chat', (p) => {
      if (Date.now() - lastChat < 500) throw new Error('Please wait before sending another message');
      lastChat = Date.now();
      requireTable().chat(userId, p?.text);
    });
    socket.on('disconnect', (reason) => { logConnection('socket.disconnected', reason); table()?.handleDisconnect(socket.id); });
  });
}
