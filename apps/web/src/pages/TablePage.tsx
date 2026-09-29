import { useTableCommand } from '../lib/useTableCommand';
import { buyInError, canJoinTable, MAX_BUY_IN } from '@poker/shared';
import { Dialog } from '../components/Dialog';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ChatMessage, HandResult, TableView } from '@poker/shared';
import { connectSocket, disconnectSocket, getSocket, requestTable } from '../socket';
import { useAuth } from '../store/auth';
import { useTable } from '../store/table';
import { PlayingCard } from '../components/PlayingCard';
import { PlayerSeat } from '../components/PlayerSeat';
import { ActionBar } from '../components/ActionBar';
import { HandResultModal } from '../components/HandResultModal';
import { ChatPanel } from '../components/ChatPanel';
import { ChatBar } from '../components/ChatBar';
import { seatPosition } from '../lib/seatLayout';
import { useDealAnimation } from '../lib/useDealAnimation';
import { useLayout } from '../store/layout';
import { LayoutSwitch } from '../components/LayoutSwitch';
import { MobileTable } from '../components/MobileTable';
import { SessionPanel, BlindStatus } from '../components/SessionPanel';
import { formatChips, useChips } from '../store/chips';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { localize, useLanguage, useT } from '../i18n';

export default function TablePage() {
  const t = useT();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const commands = useTableCommand();
  const token = useAuth((s) => s.token);
  const mobile = useLayout((s) => s.mode === 'mobile');
  const lastWakeJoin = useRef(0);
  useEffect(() => {
    if (!mobile) return;
    const viewport = window.visualViewport;
    const resize = () => document.documentElement.style.setProperty('--game-height', `${viewport?.height ?? window.innerHeight}px`);
    resize(); viewport?.addEventListener('resize', resize); window.addEventListener('resize', resize);
    const wake = () => { if (document.visibilityState === 'visible') { const socket = getSocket(); if (socket?.connected && roomId && Date.now() - lastWakeJoin.current > 1000) { lastWakeJoin.current = Date.now(); socket.emit('joinTable', { roomId }); } else if (!socket?.connected) socket?.connect(); resize(); } };
    document.addEventListener('visibilitychange', wake); window.addEventListener('pageshow', wake);
    return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', wake); window.removeEventListener('pageshow', wake); document.documentElement.style.removeProperty('--game-height'); };
  }, [mobile, roomId]);
  const [connection, setConnection] = useState('Connecting…');
  const [latency, setLatency] = useState<number | null>(null);
  const [roomInfo, setRoomInfo] = useState(false);

  const view = useTable((s) => s.view);
  const result = useTable((s) => s.result);
  const error = useTable((s) => s.error);
  const setView = useTable((s) => s.setView);
  const setResult = useTable((s) => s.setResult);
  const addChat = useTable((s) => s.addChat);
  const setError = useTable((s) => s.setError);
  const reset = useTable((s) => s.reset);

  const [sitTarget, setSitTarget] = useState<number | null>(null);
  const [buyIn, setBuyIn] = useState(1000);
  const [showChat, setShowChat] = useState(false);
  const [afkDeadline, setAfkDeadline] = useState<number | null>(null);
  const [confirmLobby, setConfirmLobby] = useState(false);

  const deal = useDealAnimation(view);
  const [bubbles, setBubbles] = useState<
    { key: number; seatIndex: number; username: string; text: string }[]
  >([]);
  const bubbleKeyRef = useRef(0);
  const [showSession, setShowSession] = useState(false);
  const [rebuy, setRebuy] = useState(false);
  const [buyInBusy, setBuyInBusy] = useState(false);
  const [buyInMessage, setBuyInMessage] = useState<string | null>(null);
  const inBB = useChips((s) => s.inBB);
  const fmt = (value: number) => formatChips(value, view?.bigBlind ?? 1, inBB);
  useEffect(() => { if (view?.session.ended && !view.saving && !view.saveError) setShowSession(true); }, [view?.session.ended, view?.saving, view?.saveError]);
  useEffect(() => { if (result && view && view.handNumber > result.handNumber) setResult(null); }, [result, view?.handNumber, setResult]);
  useEffect(() => {
    if (!rebuy || !view) return;
    const player = view.players.find((p) => p.seatIndex === view.yourSeatIndex);
    if (player && (player.stack > 0 || player.isInHand)) { setRebuy(false); setBuyInMessage(null); setResult(null); }
  }, [rebuy, view, setResult]);

  useEffect(() => {
    if (!token || !roomId) return;
    const message = (key: string) => localize(useLanguage.getState().language, key);
    reset();
    setShowSession(false); setBubbles([]); setAfkDeadline(null);
    const socket = connectSocket(token);
    setConnection(message('Connecting…'));
    const timeout = window.setTimeout(() => setConnection(message('Connection is taking longer than expected. Check that the server is running.')), 12_000);
    const bubbleTimers = new Set<number>();
    let disposed = false;
    let probing = false;
    let joinRetry: number | undefined;
    const join = () => {
      if (!socket.connected || disposed) return;
      socket.emit('joinTable', { roomId });
      window.clearTimeout(joinRetry);
      joinRetry = window.setTimeout(join, 8_000);
    };
    const probe = () => {
      if (!socket.connected || probing) return;
      probing = true;
      const started = performance.now();
      socket.volatile.timeout(5000).emit('connectionCheck', {}, (err: Error | null, response?: { ok: boolean }) => {
        probing = false;
        if (disposed) return;
        setLatency(!err && response?.ok ? Math.round(performance.now() - started) : null);
      });
    };
    setLatency(null);
    const probeTimer = window.setInterval(probe, 15_000);

    socket.on('tableState', (v: TableView) => {
      window.clearTimeout(joinRetry);
      setView(v);
      useTable.getState().setConnected(true);
      setConnection('');
      clearTimeout(timeout);
      setError(null);
      if (v.networkPaused || v.status !== 'playing' || v.actionSeatIndex !== v.yourSeatIndex) setAfkDeadline(null);
    });
    socket.on('handResult', (r: HandResult) => setResult(r));
    socket.on('afkCheck', (p: { deadline: number }) => setAfkDeadline(p.deadline));
    socket.on('chat', (m: ChatMessage) => {
      addChat(m);
      if (m.seatIndex != null) {
        const key = bubbleKeyRef.current++;
        setBubbles((b) => [
          ...b,
          { key, seatIndex: m.seatIndex as number, username: m.username, text: m.text },
        ]);
        const timer = window.setTimeout(() => {
          setBubbles((b) => b.filter((x) => x.key !== key)); bubbleTimers.delete(timer);
        }, 6000);
        bubbleTimers.add(timer);
      }
    });
    socket.on('error', (p: { message: string }) => setError(p.message));
    socket.on('connect_error', (e) => { window.clearTimeout(joinRetry); useTable.getState().setConnected(false); clearTimeout(timeout); setConnection(message(e.message === 'xhr poll error' || e.message === 'websocket error' ? 'Cannot reach the server. Reconnecting…' : e.message)); });
    socket.on('disconnect', (reason) => { console.warn('Disconnected', new Date().toISOString(), reason); window.clearTimeout(joinRetry); setLatency(null); useTable.getState().setConnected(false); setConnection(message('Connection lost. Reconnecting…')); setAfkDeadline(null); });
    socket.on('connect', () => { setConnection(message('Connected. Restoring table…')); join(); probe(); });
    if (socket.connected) { setConnection(message('Connected. Restoring table…')); join(); }

    return () => {
      disposed = true;
      clearInterval(probeTimer);
      clearTimeout(timeout);
      window.clearTimeout(joinRetry);
      bubbleTimers.forEach(clearTimeout);
      useTable.getState().setConnected(false);
      socket.removeAllListeners();
      disconnectSocket();
    };
  }, [token, roomId, reset, setView, setResult, addChat, setError]);

  useEffect(() => {
    if (!error || !view) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error, setError, view]);

  useEffect(() => {
    if (afkDeadline === null) return;
    const id = window.setTimeout(() => setAfkDeadline(null), Math.max(0, afkDeadline - Date.now()));
    return () => clearInterval(id);
  }, [afkDeadline]);

  if (!view) {
    return (
      <div className="h-full flex flex-col gap-5 items-center justify-center bg-slate-950 text-slate-400 p-6 text-center">
        <p role="status">{t(error ?? connection ?? 'Connecting to table…')}</p>
        <div className="flex gap-3"><button className="ui-button" onClick={() => window.location.reload()}>{t('Retry')}</button><button className="ui-button" onClick={() => navigate('/lobby')}>{t('Back to lobby')}</button><button className="ui-button" onClick={() => { useAuth.getState().logout(); navigate('/login'); }}>{t('Enter your name again')}</button></div>
      </div>
    );
  }

  const emptySeats = Array.from({ length: view.maxPlayers }, (_, i) => i).filter(
    (i) => !view.players.some((p) => p.seatIndex === i),
  );
  const me = view.players.find((p) => p.seatIndex === view.yourSeatIndex);

  const closeBuyIn = () => { if (!buyInBusy) { setSitTarget(null); setRebuy(false); setBuyInMessage(null); } };
  const sit = async () => {
    if (buyInBusy || (sitTarget === null && !rebuy)) return;
    const invalid = buyInError(buyIn, rebuy ? 1 : view.bigBlind);
    if (invalid) { setBuyInMessage(invalid); return; }
    setBuyInBusy(true); setBuyInMessage(null);
    try {
      if (rebuy) await requestTable('rebuy', { amount: buyIn });
      else await requestTable('sit', { seatIndex: sitTarget!, buyIn });
      if (rebuy) setResult(null);
      setRebuy(false); setSitTarget(null);
    } catch (error) { setBuyInMessage((error as Error).message); }
    finally { setBuyInBusy(false); }
  };

  const leaveTable = () => {
    disconnectSocket();
    navigate('/lobby');
  };
  const stillHere = async () => { if (await commands.run('stillHere')) setAfkDeadline(null); };


  return (
    <div className={`h-full flex flex-col text-white bg-[#0a0a0c] ${mobile ? 'mobile-game' : ''}`}>
      {connection && <div className="connection-banner" role="status"><span className="connection-indicator" aria-hidden="true" />{t(connection)} <button onClick={() => window.location.reload()}>{t('Reconnect')}</button></div>}
      {/* 顶栏 */}
      <header className={`flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur border-b border-white/5 ${mobile ? 'phone-header' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <button aria-label={t('← Lobby')} onClick={() => me && !view.session.ended ? setConfirmLobby(true) : leaveTable()} className={`text-white/60 hover:text-white text-sm shrink-0 ${mobile ? 'phone-back' : ''}`}>
            {mobile ? '←' : t('← Lobby')}
          </button>
          {/* 房间信息：悬浮显示 */}
          <div className="relative group">
            <button onClick={() => setRoomInfo(!roomInfo)} aria-expanded={roomInfo} className={`flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition ${mobile ? 'phone-room-button' : ''}`}>
              {mobile && <span className="phone-room-mark" aria-hidden="true">♠</span>}
              <span className="truncate max-w-[160px]">{view.roomName || t('Room')}</span>
              <span className="text-white/40 text-xs">▾</span>
            </button>
            <div className={`absolute left-0 top-full pt-2 ${roomInfo ? 'block' : mobile ? 'hidden' : 'hidden group-hover:block'} z-50`}>
              <div className="w-64 bg-neutral-900/95 backdrop-blur border border-white/10 rounded-xl p-4 shadow-2xl">
                <div className="text-[11px] uppercase tracking-widest text-white/40 mb-3">{t('Room')}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-white/50">{t('Name')}</span>
                    <span className="text-white truncate">{view.roomName || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-white/50">{t('Blinds')}</span>
                    <span className="text-white">{view.smallBlind}/{view.bigBlind}</span>
                  </div>
                  {view.isHost && <label className="flex justify-between items-center gap-4"><span className="text-white/50">{t('Seats')}</span><select aria-label={t('Table seats')} value={view.maxPlayers} disabled={!!connection || commands.pending || view.saving || view.saveError} onChange={(e) => void commands.run('resizeTable', { maxPlayers: Number(e.target.value) })} className="bg-neutral-800 rounded px-2 py-1">{[2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>}
                  <LayoutSwitch />
                  <LanguageSwitch />
                  <div className="text-xs text-white/50" role="status">{connection ? t('Reconnecting…') : latency === null ? t('Checking connection…') : `${t('Round trip:')} ${latency} ms`} · {getSocket()?.io.engine?.transport.name === 'websocket' ? 'WebSocket' : t('Polling')}</div>
                  <button className="ui-button w-full" onClick={() => { setRoomInfo(false); setShowSession(true); }}>{t('Session & host controls')}</button>
                  {mobile && me && <button className="ui-button w-full" disabled={!!connection || commands.pending || me.isInHand || (view.settings.mode === 'tournament' && view.session.started && !view.session.ended && me.stack > 0)} onClick={() => void commands.run('stand').then((ok) => { if (ok) setRoomInfo(false); })}>{t('Leave seat')}</button>}
                </div>
              </div>
            </div>
          </div>
          {mobile && <BlindStatus view={view} compact />}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button className={mobile ? 'phone-tool' : 'ui-button'} aria-label={t('Toggle chip display')} onClick={() => useChips.getState().toggle()}>{inBB ? 'BB' : t('Chips')}</button>
          <button className={mobile ? 'phone-tool' : 'ui-button session-header-button'} onClick={() => setShowSession(true)}>{t('Session')}</button>
          <button
            onClick={() => setShowChat((v) => !v)}
            className={mobile ? 'phone-tool' : 'text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition'}
          >
            {t(showChat ? 'Hide chat' : 'Chat')}
          </button>
          {me && (
            <button
              disabled={!!connection || commands.pending || me.isInHand || (view.settings.mode === 'tournament' && view.session.started && !view.session.ended && me.stack > 0)} onClick={() => void commands.run('stand')}
              className={`text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition ${mobile ? 'phone-leave-header' : ''}`}
            >
              {t('Leave seat')}
            </button>
          )}
        </div>
      </header>

      {!mobile && <BlindStatus view={view} />}
      {mobile ? <>
        <MobileTable view={view} deal={deal} bubbles={bubbles} onSit={(seat) => { setBuyInMessage(null); setBuyIn(view.settings.mode === 'tournament' ? view.settings.startingStack : view.bigBlind * 100); setSitTarget(seat); }} />
        <div className={`mobile-actions ${connection ? 'offline-actions' : ''}`}><ActionBar view={view} onRebuy={() => { setBuyInMessage(null); setBuyIn(view.bigBlind * 100); setRebuy(true); }} /></div>
        {showChat && <div className="mobile-chat-overlay"><button className="ui-button mb-3" onClick={() => setShowChat(false)}>{t('Close chat')}</button><ChatPanel /></div>}
      </> : <div className="flex flex-1 min-h-0">
        {/* 牌桌 */}
        <main className="flex-1 flex flex-col items-center justify-center p-4 min-w-0">
          <div className="table-area relative w-full max-w-4xl aspect-[8/5]">
            {/* 中央：公共牌 + 底池 */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4].map((i) =>
                  i < deal.boardRevealed && view.board[i] ? (
                    <PlayingCard key={i} card={view.board[i]} size="lg" reveal />
                  ) : i < view.board.length ? (
                    <PlayingCard key={i} faceDown size="lg" />
                  ) : (
                    <div
                      key={i}
                      className="w-14 h-20 rounded-lg border border-dashed border-white/10"
                    />
                  ),
                )}
              </div>
              {view.totalPot > 0 && (
                <div className="flex items-center gap-1.5 text-yellow-300 font-bold text-lg bg-black/45 backdrop-blur px-3.5 py-1 rounded-full shadow">
                  <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 shadow" />
                  {t('Pot')} {fmt(view.totalPot)}
                </div>
              )}
              {view.lastActionText && (
                <div className="text-xs text-white/90 bg-black/50 px-3 py-1 rounded-full max-w-[320px] truncate shadow">
                  {t(view.lastActionText)}
                </div>
              )}
            </div>

            {/* Seated players */}
            {view.players.map((p) => {
              const reveal = view.showdown?.players.find((s) => s.seatIndex === p.seatIndex);
              const holeCards = reveal
                ? reveal.holeCards
                : p.seatIndex === view.yourSeatIndex
                  ? view.yourCards
                  : null;
              return (
                <PlayerSeat
                  key={p.seatIndex}
                  player={p}
                  chipLabel={fmt(p.stack)}
                  betLabel={fmt(p.roundBet)}
                  isYou={p.seatIndex === view.yourSeatIndex}
                  isDealer={p.seatIndex === view.dealerSeatIndex}
                  isSmallBlind={p.seatIndex === view.smallBlindSeatIndex}
                  isBigBlind={p.seatIndex === view.bigBlindSeatIndex}
                  isAction={view.status === 'playing' && p.seatIndex === view.actionSeatIndex}
                  holeCards={holeCards}
                  handName={reveal?.handName ?? null}
                  isWinner={reveal?.isWinner ?? false}
                  yourSeatIndex={view.yourSeatIndex}
                  maxPlayers={view.maxPlayers}
                  handNumber={view.handNumber}
                  revealed={deal.holesRevealed}
                  showBacks={deal.holesDealt}
                />
              );
            })}

            {/* 空座位 */}
            {emptySeats.map((i) => {
              const pos = seatPosition(i, view.yourSeatIndex, view.maxPlayers);
              return (
                <button
                  key={i}
                  disabled={!canJoinTable(view)}
                  onClick={() => {
                    setBuyInMessage(null); setBuyIn(view.settings.mode === 'tournament' ? view.settings.startingStack : view.bigBlind * 100);
                    setSitTarget(i);
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border-2 border-dashed border-white/30 text-white/40 hover:border-green-400 hover:text-green-300 flex items-center justify-center text-sm"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  {t('Sit')}
                </button>
              );
            })}

            {/* 聊天气泡 */}
            {bubbles.map((b) => {
              const pos = seatPosition(b.seatIndex, view.yourSeatIndex, view.maxPlayers);
              const bx = pos.x + (50 - pos.x) * 0.42;
              const by = pos.y + (50 - pos.y) * 0.42;
              return (
                <div
                  key={b.key}
                  className="absolute z-10 pointer-events-none"
                  style={{ left: `${bx}%`, top: `${by}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <div className="chat-bubble">
                    <div className="text-[10px] font-bold text-emerald-600 mb-0.5">{b.username}</div>
                    <div className="text-slate-800">{b.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 行动栏 */}
          <div className={`mt-3 w-full max-w-4xl ${connection ? 'offline-actions' : ''}`}>
            <ActionBar view={view} onRebuy={() => { setBuyInMessage(null); setBuyIn(view.bigBlind * 100); setRebuy(true); }} />
          </div>
        </main>

        {/* 聊天侧栏 */}
        {showChat && (
          <aside className="w-72 border-l border-slate-800 bg-slate-900 p-3 shrink-0">
            <ChatPanel />
          </aside>
        )}
      </div>}

      {/* 结算弹窗 */}
      {result && <HandResultModal result={result} busy={commands.pending}
        onClose={() => { if (!(view.settings.mode === 'classic' && me?.stack === 0 && !view.session.ended && view.status === 'handover')) setResult(null); }}
        onContinue={me && me.stack > 0 && !view.session.ended && (view.status === 'waiting' || view.status === 'handover') ? () => {
          void commands.run('ready', { ready: true }).then((ok) => { if (ok) setResult(null); });
        } : undefined}
        onRebuy={view.settings.mode === 'classic' && me?.stack === 0 && !view.session.ended && view.status === 'handover' ? () => {
          setBuyInMessage(null); setBuyIn(view.bigBlind * 100); setRebuy(true);
        } : undefined}
        onLeave={view.settings.mode === 'classic' && me?.stack === 0 && !view.session.ended && view.status === 'handover' ? () => {
          void commands.run('stand').then((ok) => { if (ok) setResult(null); });
        } : undefined} />}

      {showSession && !result && !view.saving && !view.saveError && <SessionPanel view={view} onClose={() => setShowSession(false)} />}
      {confirmLobby && <Dialog title={t('Keep your seat?')} onClose={() => setConfirmLobby(false)} className="buyin-dialog">
        <p className="text-sm text-white/60">{t('Returning to the lobby keeps your seat and chips here. Use Leave seat between hands to take your chips out.')}</p>
        <div className="dialog-buttons"><button className="ui-button" onClick={() => setConfirmLobby(false)}>{t('Stay here')}</button><button className="primary-button" onClick={leaveTable}>{t('Back to lobby')}</button></div>
      </Dialog>}
      {afkDeadline !== null && !connection && <Dialog title={t('Still there?')} onClose={() => void stillHere()} busy={commands.pending} className="buyin-dialog">
        <p className="text-sm text-white/60">{t("It's your turn. If you don't respond, your hand will automatically check or fold.")}</p>
        <button disabled={commands.pending} className="primary-button w-full mt-5" onClick={() => void stillHere()}>{t("I'm here")}</button>
      </Dialog>}
      {(sitTarget !== null || rebuy) && <Dialog title={t(rebuy ? 'Fresh chips. Same seat.' : 'Buy in')} onClose={closeBuyIn} busy={buyInBusy} className="buyin-dialog">
        <form onSubmit={(e) => { e.preventDefault(); void sit(); }}>
          <label className="field-label">{t('Buy-in (minimum {min})', { min: rebuy ? 1 : view.bigBlind })}
            <input type="number" inputMode="numeric" value={buyIn} min={rebuy ? 1 : view.bigBlind} max={MAX_BUY_IN} step={1} aria-label={t('Buy-in amount')}
              disabled={buyInBusy || (view.settings.mode === 'tournament' && !rebuy)} onChange={(e) => setBuyIn(Number(e.target.value))} />
          </label>
          {buyInMessage && <p className="buyin-error" role="alert">{t(buyInMessage)}</p>}
          <div className="dialog-buttons"><button type="button" disabled={buyInBusy} className="ui-button" onClick={closeBuyIn}>{t('Cancel')}</button>
            <button disabled={buyInBusy || !!connection} className="primary-button">{t(buyInBusy ? 'Adding chips…' : rebuy ? 'Rebuy & Next hand' : 'Take seat')}</button></div>
        </form>
      </Dialog>}

      {/* 错误提示 */}
      {error && (
        <div className="fixed top-16 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow z-50">
          {t(error)}
        </div>
      )}

      {/* 左下角聊天输入框 */}
      {!mobile && <ChatBar />}
    </div>
  );
}
