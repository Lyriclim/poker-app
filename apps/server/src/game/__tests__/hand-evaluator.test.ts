import { describe, it, expect } from 'vitest';
import { evaluateBest, evaluateFive, compareHands, describeHand } from '../hand-evaluator';
import { cards } from './helpers';

describe('手牌评估', () => {
  it('识别各种牌型类别', () => {
    expect(evaluateFive(cards('As', 'Kh', 'Qd', 'Js', '9c')).category).toBe(1); // 高牌
    expect(evaluateFive(cards('As', 'Ah', 'Qd', 'Js', '9c')).category).toBe(2); // 一对
    expect(evaluateFive(cards('As', 'Ah', 'Qd', 'Qs', '9c')).category).toBe(3); // 两对
    expect(evaluateFive(cards('As', 'Ah', 'Ad', 'Js', '9c')).category).toBe(4); // 三条
    expect(evaluateFive(cards('2s', '3h', '4d', '5s', '6c')).category).toBe(5); // 顺子
    expect(evaluateFive(cards('As', '5s', '8s', 'Js', '2s')).category).toBe(6); // 同花
    expect(evaluateFive(cards('As', 'Ah', 'Ad', 'Kh', 'Kc')).category).toBe(7); // 葫芦
    expect(evaluateFive(cards('As', 'Ah', 'Ad', 'Ac', 'Kh')).category).toBe(8); // 四条
    expect(evaluateFive(cards('9s', '10s', 'Js', 'Qs', 'Ks')).category).toBe(9); // 同花顺
  });

  it('轮子顺子 A-2-3-4-5 是最小顺子', () => {
    const wheel = evaluateFive(cards('As', '2h', '3d', '4s', '5c'));
    const sixHigh = evaluateFive(cards('2h', '3d', '4s', '5c', '6s'));
    expect(wheel.category).toBe(5);
    expect(wheel.ranks[0]).toBe(5); // A 当 5
    expect(compareHands(sixHigh, wheel)).toBeGreaterThan(0);
  });

  it('踢脚牌决定胜负', () => {
    const a = evaluateFive(cards('As', 'Ah', 'Kd', '7s', '3c')); // AA K
    const b = evaluateFive(cards('As', 'Ah', 'Qd', '7s', '3c')); // AA Q
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });

  it('平局返回 0', () => {
    const a = evaluateFive(cards('As', 'Ah', 'Kd', '7s', '3c'));
    const b = evaluateFive(cards('Ac', 'Ad', 'Kc', '7h', '3d'));
    expect(compareHands(a, b)).toBe(0);
  });

  it('7 张牌选出最强 5 张（同花优先于顺子）', () => {
    // 5 张黑桃可凑同花；另有 7-8-9-10-J 的顺子，同花更大
    const best = evaluateBest(cards('2s', '7s', '9s', 'Js', 'Ks', '8h', '10d'));
    expect(best.category).toBe(6); // 同花
  });

  it('7 张牌里葫芦优先于三条', () => {
    const best = evaluateBest(cards('As', 'Ah', 'Ad', 'Kh', 'Kc', '2d', '3c'));
    expect(best.category).toBe(7); // AAA KK 葫芦
  });

  it('描述文字', () => {
    expect(describeHand(evaluateFive(cards('As', 'Ah', 'Ad', 'Kh', 'Kc')))).toBe('Full house (A over K)');
  });
});
