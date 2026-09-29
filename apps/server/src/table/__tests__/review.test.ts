import { describe, it, expect, vi } from 'vitest';
import { buyInError, canJoinTable, spendsEntireStack } from '@poker/shared';
import { UpdateGate } from '../update-gate';

describe('Shared table rules', () => {
  it('requires confirmation when a call uses the last chips, including a short call', () => {
    expect(spendsEntireStack('call', undefined, 80, 10, 100)).toBe(true);
    expect(spendsEntireStack('call', undefined, 90, 10, 100)).toBe(true);
    expect(spendsEntireStack('call', undefined, 100, 10, 100)).toBe(false);
    expect(spendsEntireStack('check', undefined, 80, 10, 10)).toBe(false);
    expect(spendsEntireStack('raise', 90, 80, 10, 20)).toBe(true);
  });

  it('uses the rebuy minimum in validation and rejects fractional chips', () => {
    expect(buyInError(1, 1)).toBeNull();
    expect(buyInError(0, 1)).toContain('from 1 to');
    expect(buyInError(1.5, 1)).not.toBeNull();
    expect(buyInError(1, 10)).toContain('from 10 to');
    expect(buyInError(NaN, 1)).not.toBeNull();
  });

  it('shares seat eligibility between desktop and mobile', () => {
    const view = { yourSeatIndex: null, settings: { mode: 'classic' }, session: { started: true, ended: false }, saving: false, saveError: false } as Parameters<typeof canJoinTable>[0];
    expect(canJoinTable(view)).toBe(true);
    expect(canJoinTable({ ...view, settings: { ...view.settings, mode: 'tournament' } })).toBe(false);
    expect(canJoinTable({ ...view, saving: true })).toBe(false);
    expect(canJoinTable({ ...view, yourSeatIndex: 0 })).toBe(false);
    expect(canJoinTable({ ...view, session: { ...view.session, ended: true } })).toBe(false);
  });
});

describe('UpdateGate', () => {
  it('waits for an update without creating polling timers, and releases after failure', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const gate = new UpdateGate();
    gate.busy = true;
    let completed = false;
    const waiting = gate.idle().then(() => { completed = true; });
    await Promise.resolve(); expect(completed).toBe(false);
    expect(() => { gate.busy = true; }).toThrow('already');
    gate.busy = false; await waiting;
    expect(completed).toBe(true); expect(timer).not.toHaveBeenCalled();
    gate.busy = true; gate.busy = false; await gate.idle(); expect(gate.busy).toBe(false);
    timer.mockRestore();
  });
});
