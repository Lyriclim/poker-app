import type { ActionType, BlindLevel, TableView } from './types';

export const MAX_BUY_IN = 100_000_000;

export function blindLevelErrors(levels: readonly BlindLevel[]): (string | null)[] {
  return levels.map((level, index) => {
    if (!level || !Number.isSafeInteger(level.smallBlind) || !Number.isSafeInteger(level.bigBlind) ||
      level.smallBlind < 1 || level.smallBlind > 100000 || level.bigBlind < level.smallBlind || level.bigBlind > 1000000)
      return 'Use whole blinds: small 1–100,000; big at least small, up to 1,000,000.';
    const previous = levels[index - 1];
    return previous && (level.bigBlind <= previous.bigBlind || level.smallBlind < previous.smallBlind)
      ? 'Increase the big blind and keep the small blind at least as high as the previous level.' : null;
  });
}

/** Stop at the supported ceiling rather than producing duplicate capped levels. */
export function generateBlindLevels(sb: number, bb: number): BlindLevel[] {
  if (!Number.isSafeInteger(sb) || sb < 1 || sb > 100000 || !Number.isSafeInteger(bb) || bb < sb || bb > 1000000) return [];
  const levels: BlindLevel[] = [];
  for (const factor of [1, 2, 3, 5, 8, 12, 20, 30, 50, 80]) {
    const level = { smallBlind: Math.min(100000, sb * factor), bigBlind: Math.min(1000000, bb * factor) };
    if (levels.length && level.bigBlind <= levels.at(-1)!.bigBlind) break;
    levels.push(level);
  }
  return levels;
}

export function buyInError(amount: number, minimum: number): string | null {
  return Number.isSafeInteger(amount) && amount >= minimum && amount <= MAX_BUY_IN
    ? null : `Enter a whole amount from ${minimum.toLocaleString()} to ${MAX_BUY_IN.toLocaleString()}`;
}

export function canJoinTable(view: Pick<TableView, 'yourSeatIndex' | 'settings' | 'session' | 'saving' | 'saveError'>): boolean {
  return view.yourSeatIndex === null && !view.session.ended && !view.saving && !view.saveError &&
    !(view.settings.mode === 'tournament' && view.session.started);
}

export function spendsEntireStack(type: ActionType, amount: number | undefined, stack: number, roundBet: number, currentBet: number): boolean {
  if (stack <= 0) return false;
  return type === 'allin' || (type === 'call' && currentBet - roundBet >= stack) ||
    ((type === 'bet' || type === 'raise') && amount === roundBet + stack);
}
