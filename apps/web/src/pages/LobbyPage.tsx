import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomPublic, BlindLevel } from '@poker/shared';
import { blindLevelErrors, generateBlindLevels, MAX_BUY_IN } from '@poker/shared';
import { useLayout } from '../store/layout';
import { roomsApi } from '../api';
import { useAuth } from '../store/auth';
import { LayoutSwitch } from '../components/LayoutSwitch';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n';

export default function LobbyPage() {
  const user = useAuth((s) => s.user);
  const t = useT();
  const navigate = useNavigate();
  const mobile = useLayout((s) => s.mode === 'mobile');
  const [createOpen, setCreateOpen] = useState(false);
  const [rooms, setRooms] = useState<RoomPublic[]>([]);
  const [name, setName] = useState('');
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [max, setMax] = useState(9);
  const [mode, setMode] = useState<'classic' | 'tournament'>('classic');
  const [startingStack, setStartingStack] = useState(1000);
  const [levelMinutes, setLevelMinutes] = useState(10);
  const [rising, setRising] = useState(false);
  const [levels, setLevels] = useState<BlindLevel[]>(generateBlindLevels(5, 10));
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const levelErrors = blindLevelErrors(levels);
  const usesLevels = mode === 'tournament' || rising;

  useEffect(() => {
    let active = true;
    let fetching = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (!active || fetching || document.hidden) return;
      fetching = true;
      try { const next = await roomsApi.list(controller.signal); if (active) { setRooms(next); setListError(''); } }
      catch (e) { if (active) setListError((e as Error).message); }
      finally { fetching = false; if (active) setLoading(false); }
    };
    void refresh();
    const id = setInterval(refresh, 3000);
    const wake = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', wake);
    return () => { active = false; controller.abort(); clearInterval(id); document.removeEventListener('visibilitychange', wake); };
  }, []);

  const create = async () => {
    setError('');
    if (busy) return;
    if (!Number.isSafeInteger(sb) || sb < 1 || sb > 100000 || !Number.isSafeInteger(bb) || bb < sb || bb > 1000000) {
      setError('Use whole chips. Small blind: 1–100,000. Big blind: at least the small blind, up to 1,000,000.'); return;
    }
    if (usesLevels && (levelErrors.some(Boolean) || (mode === 'tournament' && levels.length < 2))) {
      setError('Fix the highlighted blind levels. A tournament needs at least two levels.'); return;
    }
    setBusy(true);
    try { const room = await roomsApi.create({ name, smallBlind: sb, bigBlind: bb, maxPlayers: max, settings: { mode, startingStack, levelMinutes, levels: mode === 'tournament' || rising ? levels : [] } }); navigate(`/table/${room.id}`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <div className="lobby-page">
    <header className="lobby-header">
      <button onClick={() => navigate('/')} className="brand"><span>♠</span> {t('The ace in the pack')}</button>
      <div className="flex items-center gap-4 flex-wrap"><LanguageSwitch /><LayoutSwitch /><span className="text-sm text-white/50">{user?.username}</span><button className="text-sm text-white/50 hover:text-white" onClick={() => { useAuth.getState().logout(); navigate('/'); }}>{t('Switch player')}</button></div>
    </header>
    <main className="lobby-content">
      <div className="lobby-heading"><div><p className="eyebrow">{t('GOOD COMPANY. GREAT HANDS.')}</p><h1>{t('Your seat is waiting.')}</h1><p className="text-white/45">{t('Start a table or pull up a chair with friends.')}</p></div><span className="virtual-label">{t('Virtual chips only')}</span></div>
      <div className="lobby-grid">
        <section className="lobby-panel create-panel">
          <div className="flex justify-between items-start mb-7"><div><p className="eyebrow">01 / {t('HOST')}</p><h2>{t('Create a table')}</h2></div>{mobile ? <button className="ui-button" aria-expanded={createOpen} aria-controls="create-table-form" onClick={() => setCreateOpen(!createOpen)}>{t(createOpen ? 'Hide' : 'Open')}</button> : <span className="text-3xl text-emerald-300/70">♠</span>}</div>
          <form id="create-table-form" hidden={mobile && !createOpen} onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-5">
            <label className="field-label">{t('Table name')}<input maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Friday night poker')} /></label>
            <label className="field-label">{t('Game mode')}<select value={mode} onChange={(e) => setMode(e.target.value as 'classic' | 'tournament')}><option value="classic">{t('Classic')}</option><option value="tournament">{t('Tournament')}</option></select></label>
            {mode === 'classic' && <label className="flex gap-2 text-sm text-white/60"><input type="checkbox" checked={rising} onChange={(e) => setRising(e.target.checked)} /> {t('Automatically raise blinds')}</label>}
            {mode === 'tournament' && <label className="field-label">{t('Starting chips')}<input type="number" min={bb} max={MAX_BUY_IN} step={1} value={startingStack} onChange={(e) => setStartingStack(Number(e.target.value))} /></label>}
            {(mode === 'tournament' || rising) && <><label className="field-label">{t('Minutes per level')}<input type="number" min={1} max={120} value={levelMinutes} onChange={(e) => setLevelMinutes(Number(e.target.value))} /></label><fieldset className="blind-editor"><legend>{t('Blind levels')}</legend>{levels.map((level, index) => <div key={index}><div className="blind-editor-row" aria-invalid={!!levelErrors[index]}>
              <span>{index + 1}</span><input aria-label={`Level ${index + 1} small blind`} aria-invalid={!!levelErrors[index]} aria-describedby={levelErrors[index] ? `blind-error-${index}` : undefined} type="number" min={1} max={100000} step={1} disabled={index === 0} value={level.smallBlind} onChange={(e) => setLevels((current) => current.map((item, i) => i === index ? { ...item, smallBlind: Number(e.target.value) } : item))} />
              <span>/</span><input aria-label={`Level ${index + 1} big blind`} aria-invalid={!!levelErrors[index]} aria-describedby={levelErrors[index] ? `blind-error-${index}` : undefined} type="number" min={level.smallBlind} max={1000000} step={1} disabled={index === 0} value={level.bigBlind} onChange={(e) => setLevels((current) => current.map((item, i) => i === index ? { ...item, bigBlind: Number(e.target.value) } : item))} />
              <button type="button" className="ui-button" disabled={index === 0 || levels.length <= 2} aria-label={t('Remove level {n}', { n: index + 1 })} onClick={() => setLevels((current) => current.filter((_, i) => i !== index))}>×</button>
            </div>{levelErrors[index] && <p id={`blind-error-${index}`} className="blind-level-error">{t('Level {n}', { n: index + 1 })}: {t(levelErrors[index])}</p>}</div>)}<button type="button" className="ui-button" disabled={levels.length >= 30 || levels.at(-1)!.bigBlind >= 1000000} onClick={() => setLevels((current) => { const last = current.at(-1)!; return [...current, { smallBlind: Math.min(100000, last.smallBlind * 2), bigBlind: Math.min(1000000, last.bigBlind * 2) }]; })}>{t('Add level')}</button><button type="button" className="ui-button ml-2" disabled={generateBlindLevels(sb, bb).length === 0} onClick={() => setLevels(generateBlindLevels(sb, bb))}>{t('Regenerate levels')}</button></fieldset><p className="text-xs text-white/45">{t('First level follows the starting blinds. Regenerate replaces the later levels. New blinds apply next hand.')}</p></>}
            <div className="blind-fields"><label className="field-label">{t('Small blind')}<input type="number" min={1} max={100000} step={1} value={sb} onChange={(e) => { const value = Number(e.target.value); setSb(value); setLevels((current) => current.map((level, i) => i === 0 ? { ...level, smallBlind: value } : level)); }} required /></label><label className="field-label">{t('Big blind')}<input type="number" min={sb} max={1000000} step={1} value={bb} onChange={(e) => { const value = Number(e.target.value); setBb(value); setLevels((current) => current.map((level, i) => i === 0 ? { ...level, bigBlind: value } : level)); }} required /></label></div>
            <fieldset><legend className="field-label mb-2">{t('Seats')}</legend><div className="seat-picker">{[2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button type="button" key={n} aria-pressed={max === n} onClick={() => setMax(n)}>{n}</button>)}</div></fieldset>
            <div className="table-preview"><div className="preview-oval"><span>♠</span></div><div><strong>{sb || '—'} / {bb || '—'}</strong><p>{max} {t('seats')} · {mode === 'tournament' ? `${startingStack} ${t('Starting chips')}` : t('Choose your buy-in at the table')}</p><p>{t(mode === 'tournament' ? 'Everyone gets ready. The host starts. No late entries or rebuys.' : 'Friends can join the next hand. Rebuy after losing all chips.')}</p></div></div>
            <button disabled={busy} className="primary-button w-full" type="submit">{t(busy ? 'Please wait…' : 'Create & enter')} <span>↗</span></button>
          </form>
        </section>
        <div className="space-y-5 open-tables-column">
          <section className="lobby-panel"><div className="flex justify-between items-center mb-5"><h2>{t('Open tables')}</h2><span className="text-xs text-white/40">{rooms.length} {t('available')}</span></div>
            {listError && <p role="alert" className="text-amber-300 text-sm mb-4">{t(listError)} · {t('Retrying…')}</p>}
            {loading ? <p className="empty-tables">{t('Loading tables…')}</p> : rooms.length === 0 ? <div className="empty-tables"><span className="text-3xl block mb-3">♧</span>{t('No tables yet.')}<br /><span className="text-xs">{t('Create the first one for your friends.')}</span></div> : <div className="room-list">{rooms.map((r) => <button key={r.id} className="room-card" onClick={() => navigate(`/table/${r.id}`)}><div className="room-symbol">♠</div><div className="min-w-0 flex-1"><strong className="block truncate">{r.name || t('Table')}</strong><span className="text-xs text-white/45">{t(r.mode === 'tournament' ? 'Tournament' : 'Classic')} · {t('Blinds')} {r.smallBlind}/{r.bigBlind} · {r.playerCount}/{r.maxPlayers} {t('seated')}</span></div><span className={`room-status ${r.status === 'PLAYING' ? 'live' : ''}`}>{t(({ PLAYING: 'In play', WAITING: 'Waiting', PAUSED: 'Paused', CLOSED: 'Closed' } as const)[r.status])}</span><span className="text-white/30">↗</span></button>)}</div>}
          </section>
        </div>
      </div>
      {error && <div role="alert" className="lobby-error">{t(error)}<button aria-label={t('Dismiss error')} onClick={() => setError('')}>×</button></div>}
    </main>
  </div>;
}
