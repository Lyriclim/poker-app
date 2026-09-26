import type { Server, Socket } from 'socket.io';
import type { ActionType } from '@poker/shared';
import { verifyToken } from '../utils/auth';
import type { TableManager } from '../table/manager';

export function setupGateway(io: Server, manager: TableManager): void {
  // 连接鉴权：握手时携带 token
  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    if (!token) return next(new Error('未登录'));
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('登录已失效'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (): string => socket.data.userId as string;
    const username = (): string => socket.data.username as string;

    const table = (): ReturnType<TableManager['get']> =>
      manager.get((socket.data.tableId as string) ?? '');

    socket.on('joinTable', (payload: { roomId: string }) => {
      try {
        const t = manager.get(payload.roomId);
        if (!t) {
          socket.emit('error', { message: '房间不存在或已关闭' });
          return;
        }
        socket.data.tableId = payload.roomId;
        t.join(socket, { id: userId(), username: username() });
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('sit', (payload: { seatIndex: number; buyIn: number }) => {
      const t = table();
      if (!t) return;
      t.sit(userId(), payload.seatIndex, payload.buyIn)
        .catch((err) => socket.emit('error', { message: (err as Error).message }));
    });

    socket.on('stand', () => {
      const t = table();
      if (!t) return;
      t.stand(userId()).catch((err) =>
        socket.emit('error', { message: (err as Error).message }),
      );
    });

    socket.on('ready', (payload: { ready: boolean }) => {
      const t = table();
      if (!t) return;
      try {
        t.setReady(userId(), payload.ready);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('ackShowdown', () => {
      table()?.ackShowdown(userId());
    });

    socket.on('showHand', (payload: { show: boolean }) => {
      const t = table();
      if (!t) return;
      try {
        t.showHand(userId(), payload.show);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('stillHere', () => {
      table()?.stillHere(userId());
    });

    socket.on('action', (payload: { type: ActionType; amount?: number }) => {
      const t = table();
      if (!t) return;
      try {
        t.action(userId(), payload.type, payload.amount ?? 0);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('chat', (payload: { text: string }) => {
      table()?.chat(userId(), payload.text ?? '');
    });

    socket.on('disconnect', () => {
      const t = table();
      if (t) t.handleDisconnect(socket.id);
    });
  });
}
