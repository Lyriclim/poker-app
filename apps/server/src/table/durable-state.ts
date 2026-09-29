import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameCheckpoint } from '../game/engine';
import type { HandResult, SessionPlayer, SessionState, WinnerInfo } from '@poker/shared';

export interface HandCheckpoint {
  version: 1;
  game: GameCheckpoint;
  session: SessionState;
  entries: SessionPlayer[];
  handStartStacks: [string, number][];
  handParticipants: string[];
  handShowdowns: string[];
  resultPots: HandResult['pots'];
  lastActionText: string | null;
  pendingActions: { playerId: string; seatIndex: number; action: string; amount: number; street: string }[];
  endingWinners: WinnerInfo[] | null;
}

// This directory stays on the host; checkpoints contain private cards and must never be served by HTTP.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.runtime/room-state');
const lastActivityWrite = new Map<string, number>();
function filename(roomId: string, kind: 'hand' | 'activity'): string {
  return path.join(ROOT, `${createHash('sha256').update(roomId).digest('hex')}.${kind}.json`);
}
function atomicWrite(file: string, value: string): void {
  mkdirSync(ROOT, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, value, { flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function saveHandCheckpoint(roomId: string, state: HandCheckpoint): void {
  atomicWrite(filename(roomId, 'hand'), JSON.stringify(state));
}
export function loadHandCheckpoint(roomId: string): HandCheckpoint | null {
  const file = filename(roomId, 'hand');
  if (!existsSync(file)) return null;
  const saved = JSON.parse(readFileSync(file, 'utf8')) as HandCheckpoint;
  if (saved.version !== 1) throw new Error(`Unsupported hand checkpoint for room ${roomId}`);
  return saved;
}
export function clearHandCheckpoint(roomId: string): void {
  const file = filename(roomId, 'hand');
  if (existsSync(file)) unlinkSync(file);
}
export function saveActivity(roomId: string, at: number): void {
  if (at - (lastActivityWrite.get(roomId) ?? 0) < 1_000) return;
  atomicWrite(filename(roomId, 'activity'), String(at));
  lastActivityWrite.set(roomId, at);
}
export function loadActivity(roomId: string): number | null {
  const file = filename(roomId, 'activity');
  if (!existsSync(file)) return null;
  const at = Number(readFileSync(file, 'utf8'));
  return Number.isFinite(at) && at > 0 ? at : null;
}
export function clearActivity(roomId: string): void {
  const file = filename(roomId, 'activity');
  if (existsSync(file)) unlinkSync(file);
  lastActivityWrite.delete(roomId);
}
