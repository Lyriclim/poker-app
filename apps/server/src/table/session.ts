import type { RoomSettings, SessionState } from '@poker/shared';
import { blindLevelErrors, MAX_BUY_IN } from '@poker/shared';
import { GameError } from '../game/engine';

export function validateSettings(value: unknown, sb: number, bb: number): RoomSettings {
  const raw = (value ?? {}) as Partial<RoomSettings>;
  if (raw.mode !== undefined && raw.mode !== 'classic' && raw.mode !== 'tournament') throw new GameError('Invalid game mode');
  const mode = raw.mode ?? 'classic';
  const startingStack = raw.startingStack ?? 1000;
  const levelMinutes = raw.levelMinutes ?? 10;
  if (!Number.isSafeInteger(startingStack) || startingStack < (mode === 'tournament' ? bb : 1) || startingStack > MAX_BUY_IN) throw new GameError('Invalid starting stack');
  if (!Number.isInteger(levelMinutes) || levelMinutes < 1 || levelMinutes > 120) throw new GameError('Level duration must be 1 to 120 minutes');
  const levels = raw.levels ?? [];
  if (!Array.isArray(levels) || levels.length > 30 || (mode === 'tournament' && levels.length < 2)) throw new GameError('Use 2 to 30 tournament blind levels');
  if (blindLevelErrors(levels).some(Boolean)) throw new GameError('Blind levels must use increasing whole chip amounts');
  if (levels.length && (levels[0].smallBlind !== sb || levels[0].bigBlind !== bb)) throw new GameError('The first level must match the starting blinds');
  return { mode, startingStack, levelMinutes, levels };
}

export function freshSession(): SessionState {
  return { started: false, ended: false, paused: false, pauseRequested: false, elapsedMs: 0, runningSince: null, level: 0,
    lastHand: null, fun: { lastRecordedHand: 0, players: {}, awards: [] } };
}
export function elapsed(state: SessionState, now = Date.now()): number {
  return state.elapsedMs + (state.runningSince === null ? 0 : Math.max(0, now - state.runningSince));
}
export function checkpoint(state: SessionState, now = Date.now()): SessionState {
  return { ...state, elapsedMs: elapsed(state, now), runningSince: state.runningSince === null ? null : now };
}
