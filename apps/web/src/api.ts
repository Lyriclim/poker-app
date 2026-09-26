import type { AuthUser, RoomPublic } from '@poker/shared';
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
  if (!res.ok) throw new Error(data.message ?? '请求失败');
  return data as T;
}

export const authApi = {
  register: (username: string, password: string, registerCode?: string) =>
    request<{ token: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, registerCode }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<AuthUser>('/auth/me'),
};

export const roomsApi = {
  list: () => request<RoomPublic[]>('/rooms'),
  create: (payload: {
    name?: string;
    smallBlind?: number;
    bigBlind?: number;
    maxPlayers?: number;
  }) =>
    request<RoomPublic>('/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  byCode: (inviteCode: string) => request<RoomPublic>(`/rooms/${encodeURIComponent(inviteCode)}`),
};
