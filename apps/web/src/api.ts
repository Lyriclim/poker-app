import type { AuthUser, RoomPublic, RoomSettings } from '@poker/shared';
import { useAuth } from './store/auth';

const BASE = '/api';

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 401 && path !== '/auth/enter') {
    useAuth.getState().logout();
    throw new Error('Session expired. Enter your name again.');
  }
  if (!res.ok) throw new Error(data.message ?? 'Request failed');
  return data as T;
}

export const authApi = {
  enter: (username: string) =>
    request<{ token: string; user: AuthUser }>('/auth/enter', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  me: () => request<AuthUser>('/auth/me'),
};

export const roomsApi = {
  list: (signal?: AbortSignal) => request<RoomPublic[]>('/rooms', { signal }),
  create: (payload: {
    name?: string;
    smallBlind?: number;
    bigBlind?: number;
    maxPlayers?: number;
    settings?: RoomSettings;
  }) =>
    request<RoomPublic>('/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
