import { describe, it, expect } from 'vitest';
import { checkpoint, elapsed, freshSession, validateSettings } from '../session';
describe('Session settings and clock', () => {
  it('rejects malformed, decreasing and mismatched blind schedules', () => {
    for (const levels of [[{smallBlind:5,bigBlind:10},{smallBlind:3,bigBlind:20}],[{smallBlind:5,bigBlind:10},{smallBlind:10,bigBlind:10}],[{smallBlind:10,bigBlind:20},{smallBlind:20,bigBlind:40}]]) expect(() => validateSettings({mode:'tournament',levels},5,10)).toThrow();
    expect(() => validateSettings({mode:'tournament',levels:'invalid'},5,10)).toThrow();
    expect(() => validateSettings({mode:'tournament'},5,10)).toThrow();
  });
  it('allows classic fixed or rising blinds', () => {
    expect(validateSettings({},5,10).levels).toEqual([]);
    expect(validateSettings({levels:[{smallBlind:5,bigBlind:10},{smallBlind:10,bigBlind:20}]},5,10).mode).toBe('classic');
  });
  it('checkpoints running time without double counting', () => {
    const state={...freshSession(),started:true,elapsedMs:200,runningSince:1000};
    expect(elapsed(state,1600)).toBe(800); const saved=checkpoint(state,1600);
    expect(elapsed(saved,2000)).toBe(1200);
    expect(elapsed({...saved,runningSince:null},5000)).toBe(800);
  });
});
