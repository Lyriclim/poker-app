import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { blindLevelErrors, generateBlindLevels, type TableView } from '@poker/shared';
import { ActionBar } from '../components/ActionBar';
import { BlindStatus } from '../components/SessionPanel';
import { authApi, roomsApi } from '../api';
import { useAuth } from '../store/auth';
import { useTable } from '../store/table';
import { sendChat } from '../lib/useChatComposer';
import { requestTable } from '../socket';

vi.mock('../socket', () => ({ requestTable: vi.fn() }));
vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: globalThis.localStorage } });
});

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); useAuth.getState().logout(); useTable.getState().reset(); });

describe('Player-facing recovery flows', () => {
  it('uses natural Chinese for all-in and keeps English when switched back', async () => {
    const { localize } = await import('../i18n');
    expect(localize('zh', 'Take a breath.')).toBe('别上头！');
    expect(localize('zh', "You're going all-in with {chips} chips. Ready?", { chips: '1,000' })).toContain('押上剩余的 1,000 筹码');
    expect(localize('zh', 'Full house (A over K)')).toBe('A 葫芦 K');
    expect(localize('zh', 'Alex raises (+15 chips)')).toBe('Alex加注 15');
    expect(localize('en', 'Take a breath.')).toBe('Take a breath.');
  });
  it('replaces betting controls with host recovery controls during a network hold', () => {
    vi.stubGlobal('React', React);
    const view = { networkPaused: true, players: [], yourSeatIndex: null, isHost: true,
      currentBet: 0, bigBlind: 10, minRaise: 10, session: { ended: false }, status: 'playing' } as unknown as TableView;
    const markup = renderToStaticMarkup(React.createElement(ActionBar, { view, onRebuy() {} }));
    expect(markup).toContain('Cards and chips are preserved');
    expect(markup).toContain('Resume with two players online');
    expect(markup).toContain('disabled');
    expect(markup).not.toContain('Tap an empty seat');
  });
  it('offers a busted Classic player rebuy for the next hand', async () => {
    vi.stubGlobal('React', React);
    const { localize } = await import('../i18n');
    const view = { networkPaused: false, saving: false, saveError: false,
      players: [{ seatIndex: 0, stack: 0, isInHand: false }], yourSeatIndex: 0,
      settings: { mode: 'classic' }, session: { ended: false }, status: 'handover',
      currentBet: 0, bigBlind: 10, minRaise: 10 } as unknown as TableView;
    const markup = renderToStaticMarkup(React.createElement(ActionBar, { view, onRebuy() {} }));
    expect(markup).toContain('Rebuy &amp; Next hand');
    expect(localize('zh', 'Rebuy & Next hand')).toBe('补码并加入下一手');
  });
  it('does not queue offline chat and keeps failed drafts across both composers', async () => {
    const state = useTable.getState(); state.setView({ roomId: 'preview' } as TableView); state.setChatDraft('A draft');
    await sendChat(); expect(requestTable).not.toHaveBeenCalled(); expect(useTable.getState().chatDraft).toBe('A draft');
    state.setConnected(true); vi.mocked(requestTable).mockRejectedValueOnce(new Error('Please wait'));
    await sendChat(); expect(useTable.getState().chatDraft).toBe('A draft'); expect(useTable.getState().error).toBe('Please wait');
    let confirm!: () => void;
    vi.mocked(requestTable).mockImplementationOnce(() => new Promise<void>((resolve) => { confirm = resolve; }));
    const sending = sendChat(); await sendChat(); expect(requestTable).toHaveBeenCalledTimes(2);
    state.setChatDraft('New draft'); confirm(); await sending;
    expect(useTable.getState().chatDraft).toBe('New draft'); expect(useTable.getState().chatSending).toBe(false);
    vi.mocked(requestTable).mockResolvedValueOnce(); await sendChat(); expect(useTable.getState().chatDraft).toBe('');
  });
  it('keeps a retry available when final settlement fails, including for a host without a seat', () => {
    vi.stubGlobal('React', React);
    const view = { players: [], yourSeatIndex: null, isHost: true, currentBet: 0, bigBlind: 10,
      minRaise: 10, session: { ended: true }, settings: { mode: 'classic', levels: [] },
      saving: false, saveError: true } as unknown as TableView;
    const failed = renderToStaticMarkup(React.createElement(ActionBar, { view, onRebuy() {} }));
    expect(failed).toContain('Retry save'); expect(failed).not.toContain('Session complete');
    expect(renderToStaticMarkup(React.createElement(BlindStatus, { view }))).toContain('Results not saved');
    const saving = renderToStaticMarkup(React.createElement(ActionBar, { view: { ...view, saving: true, saveError: false }, onRebuy() {} }));
    expect(saving).toContain('Saving this hand'); expect(saving).not.toContain('Session complete');
    const saved = renderToStaticMarkup(React.createElement(ActionBar, { view: { ...view, saveError: false }, onRebuy() {} }));
    expect(saved).toContain('Session complete');
  });

  it('sends only the name and keeps entry errors without clearing an existing session', async () => {
    useAuth.getState().setAuth('preview', { id: 'preview', username: 'Preview', avatar: null });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Too many attempts. Try again later.' }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Please enter your name' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(authApi.enter('Preview')).rejects.toThrow('Too many attempts');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: 'Preview' });
    expect(useAuth.getState().token).toBe('preview');
    await expect(roomsApi.list()).rejects.toThrow('Session expired');
    expect(useAuth.getState().token).toBeNull();
  });

  it('identifies conflicting levels and regenerates a valid schedule without duplicate ceilings', () => {
    const changed = [{ smallBlind: 50, bigBlind: 100 }, { smallBlind: 10, bigBlind: 20 }];
    expect(blindLevelErrors(changed)[1]).toBeTruthy();
    const regenerated = generateBlindLevels(50, 100);
    expect(regenerated[0]).toEqual(changed[0]); expect(blindLevelErrors(regenerated).every(e => e === null)).toBe(true);
    const capped = generateBlindLevels(100000, 900000);
    expect(capped).toHaveLength(2); expect(capped[1].bigBlind).toBe(1000000);
    expect(generateBlindLevels(10, 5)).toEqual([]);
  });
});

