import type { SessionAward, SessionFun, SessionSummary } from '@poker/shared';

/** Record only settled hands; rebuy amounts and unrevealed cards never become awards. */
export function recordFunHand(fun: SessionFun, handNumber: number,
  participants: string[], showdowns: string[], startStacks: Map<string, number>,
  players: SessionSummary[]): SessionFun {
  if (handNumber <= fun.lastRecordedHand) return fun;
  const next: SessionFun = { ...fun, lastRecordedHand: handNumber, players: { ...fun.players } };
  for (const userId of participants) {
    const player = players.find((entry) => entry.userId === userId);
    if (!player) continue;
    const old = fun.players[userId] ?? { hands: 0, wins: 0, showdowns: 0, biggestGain: 0, lowestNet: 0 };
    const gain = player.stack - (startStacks.get(userId) ?? player.stack);
    next.players[userId] = {
      hands: old.hands + 1,
      wins: old.wins + (gain > 0 ? 1 : 0),
      showdowns: old.showdowns + (showdowns.includes(userId) ? 1 : 0),
      biggestGain: Math.max(old.biggestGain, gain),
      lowestNet: Math.min(old.lowestNet, player.net),
    };
  }
  return next;
}

export function sessionAwards(fun: SessionFun, players: SessionSummary[]): SessionAward[] {
  const awards: SessionAward[] = [];
  const add = (id: SessionAward['id'], title: string, description: string,
    score: (player: SessionSummary) => number, detail: (player: SessionSummary) => string, minimum: number) => {
    const candidates = players.filter((player) => fun.players[player.userId]?.hands > 0);
    const best = Math.max(0, ...candidates.map(score));
    if (best < minimum) return;
    awards.push({ id, title, description, recipients: candidates.filter((player) => score(player) === best)
      .map((player) => ({ userId: player.userId, username: player.username, detail: detail(player) })) });
  };
  const stats = (player: SessionSummary) => fun.players[player.userId];
  const chips = (value: number) => value.toLocaleString('en-US');
  add('collector', 'Pot Collector', 'Most hands finished with a chip gain. At least 2 wins.',
    (player) => stats(player).wins, (player) => `${stats(player).wins} winning hands`, 2);
  add('showdown', 'Showdown Regular', 'Most hands reached a contested showdown. At least 3 showdowns.',
    (player) => stats(player).showdowns, (player) => `${stats(player).showdowns} showdowns`, 3);
  add('comeback', 'Comeback Kid', 'Finished ahead after a settled hand put them behind. Rebuys do not count as profit.',
    (player) => stats(player).lowestNet < 0 && player.net > 0 ? player.net - stats(player).lowestNet : 0,
    (player) => `Net: −${chips(-stats(player).lowestNet)} → +${chips(player.net)}`, 1);
  add('scoop', 'Biggest Catch', 'Largest net chip gain in a single hand, including all side pots.',
    (player) => stats(player).biggestGain, (player) => `+${chips(stats(player).biggestGain)} chips in one hand`, 1);
  return awards;
}
