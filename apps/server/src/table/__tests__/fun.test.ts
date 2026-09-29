import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '@poker/shared';
import { recordFunHand, sessionAwards } from '../fun';
import { freshSession } from '../session';

const player = (userId: string, stack: number, buyIn = 100, cashOut = 0): SessionSummary => ({
  userId, username: userId.toUpperCase(), stack, buyIn, cashOut, rank: null, net: stack + cashOut - buyIn,
});

describe('Session highlights', () => {
  it('records a hand once and excludes spectators and newly seated players', () => {
    const start = freshSession().fun;
    const recorded = recordFunHand(start, 1, ['a','b'], ['a','b'], new Map([['a',100],['b',100]]), [player('a',120),player('b',80),player('c',100)]);
    expect(recorded.players.a).toMatchObject({ hands: 1, wins: 1, showdowns: 1, biggestGain: 20 });
    expect(recorded.players.b).toMatchObject({ hands: 1, wins: 0, lowestNet: -20 });
    expect(recorded.players.c).toBeUndefined();
    expect(start.players).toEqual({});
    expect(recordFunHand(recorded, 1, ['a'], [], new Map(), [player('a',999)])).toBe(recorded);
  });

  it('shares tied awards and does not invent titles for too few hands', () => {
    const empty = freshSession().fun;
    expect(sessionAwards(empty, [player('a',100)])).toEqual([]);
    const stats = { hands: 3, wins: 2, showdowns: 3, biggestGain: 20, lowestNet: 0 };
    const awards = sessionAwards({ ...empty, players: { a:stats, b:stats } }, [player('a',100),player('b',100)]);
    expect(awards.map((award) => award.id)).toEqual(['collector','showdown','scoop']);
    expect(awards.every((award) => award.recipients.length === 2)).toBe(true);
  });

  it('uses net profit after rebuys and cash-outs for the comeback award', () => {
    const fun = { ...freshSession().fun, players: { a: { hands:3,wins:1,showdowns:0,biggestGain:50,lowestNet:-100 } } };
    expect(sessionAwards(fun,[player('a',150,200)]).some((award) => award.id==='comeback')).toBe(false);
    const award = sessionAwards(fun,[player('a',0,200,225)]).find((award) => award.id==='comeback');
    expect(award?.recipients[0].detail).toBe('Net: −100 → +25');
  });
});
