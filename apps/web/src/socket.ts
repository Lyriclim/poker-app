import type { ClientToServerEvents } from '@poker/shared';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Never buffer a table command across a disconnect or retry it automatically. */
export async function requestTable<E extends keyof ClientToServerEvents>(event: E, ...args: Parameters<ClientToServerEvents[E]>): Promise<void> {
  const current = getSocket();
  if (!current?.connected) throw new Error('Connection lost. Reconnect before trying again.');
  return new Promise((resolve, reject) => {
    current.timeout(10000).emit(event, ...args, (error: Error | null, result?: { ok: boolean; message?: string }) => {
      if (error) reject(new Error('No confirmation received. Check the current table before trying again.'));
      else if (!result?.ok) reject(new Error(result?.message ?? 'Unable to complete this action'));
      else resolve();
    });
  });
}
