import { describe, it, expect } from 'vitest';
import { PokerGame } from '../engine';
import type { ActionType } from '@poker/shared';
import { cards } from './helpers';

function makeGame() {
  return new PokerGame({ smallBlind: 5, bigBlind: 10, maxPlayers: 9 });
}

/** 自动跟注/过牌把一手牌打完（用于验证流程与筹码守恒） */
function playOut(game: PokerGame) {
  let guard = 0;
  while (game.status === 'playing' && guard++ < 5000) {
    const seat = game.actionSeatIndex!;
    const p = game.getPlayer(seat)!;
    const toCall = game.currentBet - p.roundBet;
    const action: ActionType = toCall === 0 ? 'check' : 'call';
    game.applyAction(seat, action, 0);
  }
  if (game.status === 'showdown') game.finalizeShowdown();
}

describe('游戏引擎', () => {
  it('allows winnings and action amounts above the per-buy-in limit', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 150_000_000);
    game.addPlayer('u2', 'B', 1, 150_000_000);
    game.startHand();
    expect(() => game.applyAction(game.actionSeatIndex!, 'raise', 120_000_000)).not.toThrow();
  });

  it('不足两人无法开局', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 1000);
    expect(game.startHand()).toHaveLength(0);
    expect(game.status).toBe('waiting');
  });

  it('一整手自动打完，筹码守恒', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 1000);
    game.addPlayer('u2', 'B', 1, 1000);
    game.addPlayer('u3', 'C', 2, 1000);
    game.startHand();
    expect(game.status).toBe('playing');
    playOut(game);
    expect(game.status).toBe('handover');
    const sum = game.players.reduce((s, p) => s + p.stack, 0);
    expect(sum).toBe(3000);
  });

  it('单挑：小盲（按钮）弃牌，大盲直接赢底池', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 1000); // 按钮/小盲
    game.addPlayer('u2', 'B', 1, 1000); // 大盲
    game.startHand();
    expect(game.actionSeatIndex).toBe(0); // 单挑 preflop 按钮先动
    const events = game.applyAction(0, 'fold');
    expect(game.status).toBe('showdown');
    expect(game.soleWinnerSeatIndex).toBe(1);
    expect(game.getPlayer(1)!.stack).toBe(1005); // 1000 - 10 + 15
    expect(game.getPlayer(0)!.stack).toBe(995); // 1000 - 5
    expect(events.some((e) => e.type === 'showdown')).toBe(true);
    const endEvents = game.finalizeShowdown();
    expect(game.status).toBe('handover');
    expect(endEvents.some((e) => e.type === 'handEnded')).toBe(true);
  });

  it('摊牌阶段展示所有未弃牌玩家手牌，finalize 后才结束', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 1000);
    game.addPlayer('u2', 'B', 1, 1000);
    game.startHand();
    let guard = 0;
    while (game.status === 'playing' && guard++ < 5000) {
      const seat = game.actionSeatIndex!;
      const p = game.getPlayer(seat)!;
      const toCall = game.currentBet - p.roundBet;
      game.applyAction(seat, toCall === 0 ? 'check' : 'call', 0);
    }
    expect(game.status).toBe('showdown');
    expect(game.showdownReveals.length).toBeGreaterThan(0);
    for (const r of game.showdownReveals) {
      expect(r.holeCards).toHaveLength(2);
      expect(r.handName).toBeTruthy();
    }
    game.finalizeShowdown();
    expect(game.status).toBe('handover');
  });

  it('全弃牌后赢家选择展示手牌（翻牌前，公共牌不足5张）不崩溃', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 1000);
    game.addPlayer('u2', 'B', 1, 1000);
    game.startHand();
    game.applyAction(0, 'fold'); // 翻牌前全弃牌，公共牌 0 张
    const events = game.finalizeShowdown(true); // 选择展示手牌
    expect(game.status).toBe('handover');
    const ended = events.find((e) => e.type === 'handEnded');
    expect(ended).toBeTruthy();
    expect(ended!.winners[0].cards).toHaveLength(2); // 亮出两张底牌
    expect(ended!.winners[0].handName).toBeNull(); // 不足5张，无牌型名
  });

  it('摊牌结算：对A 赢 对K', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 0);
    game.addPlayer('u2', 'B', 1, 0);
    game.board = cards('2s', '7d', '8h', '3c', '9s');
    const [pa, pb] = game.players;
    pa.isInHand = true;
    pb.isInHand = true;
    pa.holeCards = cards('As', 'Ad'); // 对 A
    pb.holeCards = cards('Ks', 'Kd'); // 对 K
    pa.totalBet = 100;
    pb.totalBet = 100;
    const { winners } = game.determineWinners();
    expect(winners).toHaveLength(1);
    expect(winners[0].seatIndex).toBe(0);
    expect(winners[0].amount).toBe(200);
  });

  it('边池：短码玩家赢主池，另一人赢边池', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 0); // 短码 50
    game.addPlayer('u2', 'B', 1, 0); // 100
    game.addPlayer('u3', 'C', 2, 0); // 100
    game.board = cards('7h', '9s', '3c', '2d', '5h');
    const [pa, pb, pc] = game.players;
    for (const p of game.players) p.isInHand = true;
    pa.holeCards = cards('Ac', 'Ad'); // 对 A —— 赢主池
    pb.holeCards = cards('Kc', 'Kd'); // 对 K —— 赢边池
    pc.holeCards = cards('Qc', 'Qd'); // 对 Q
    pa.totalBet = 50;
    pb.totalBet = 100;
    pc.totalBet = 100;

    const { winners, payouts } = game.determineWinners();
    expect(payouts.get(0)).toBe(150); // 主池 150
    expect(payouts.get(1)).toBe(100); // 边池 100
    expect(payouts.get(2)).toBeUndefined();
    expect(winners.reduce((s, w) => s + w.amount, 0)).toBe(250);
  });

  it('拒绝非法行动：未轮到 / 下注过小', () => {
    const game = makeGame();
    game.addPlayer('u1', 'A', 0, 1000);
    game.addPlayer('u2', 'B', 1, 1000);
    game.startHand();
    const seat = game.actionSeatIndex!;
    const other = seat === 0 ? 1 : 0;
    expect(() => game.applyAction(other, 'fold')).toThrow();
  });
});
