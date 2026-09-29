import { Dialog } from './Dialog';
import { useEffect, useState } from 'react';
import type { TableView } from '@poker/shared';
import { useTableCommand } from '../lib/useTableCommand';
import { ConfirmDialog } from './ConfirmDialog';
import { useT } from '../i18n';
export function BlindStatus({ view, compact = false }: { view: TableView; compact?: boolean }) {
  const t = useT();
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (view.nextLevelAt === null) { setSeconds(null); return; }
    const target = Date.now() + Math.max(0, view.nextLevelAt - view.serverNow);
    const tick = () => setSeconds(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [view.nextLevelAt, view.serverNow]);
  const next = view.settings.levels[view.session.level + 1];
  const detail = view.saving ? t('Saving…') : view.saveError ? t('Results not saved') : view.session.ended ? t('Complete') : view.session.lastHand != null ? `${t(view.session.lastHand === view.handNumber ? 'Last hand' : 'Next hand is the last')}${view.session.paused ? ` · ${t('Paused')}` : ''}` : view.session.paused ? t('Paused') : view.session.pauseRequested ? t('Pausing after this hand') : !view.session.started && view.settings.mode === 'tournament' ? t('Waiting for host') : next && seconds !== null ? seconds === 0 ? `${t('Next hand')}: ${next.smallBlind}/${next.bigBlind}` : `${t('Level')} ${view.session.level + 1} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : view.settings.levels.length ? `${t('Level')} ${view.session.level + 1} · ${t('Final level')}` : t('Fixed blinds');
  if (compact) return <span className="phone-blind-tag" title={detail}>{view.smallBlind}/{view.bigBlind}{detail !== t('Fixed blinds') && <small> · {detail}</small>}</span>;
  return <div className="blind-status"><span>{t(view.settings.mode === 'tournament' ? 'Tournament' : 'Classic')} · {view.smallBlind}/{view.bigBlind}</span><span>{detail}</span></div>;
}
export function SessionPanel({ view, onClose }: { view: TableView; onClose: () => void }) {
  const t = useT();
  const commands = useTableCommand();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLast, setConfirmLast] = useState(false);
  const live = view.status === 'playing' || view.status === 'showdown';
  const busy = view.saving || view.saveError || commands.pending;
  const entries = [...view.sessionPlayers].sort((a, b) => view.settings.mode === 'tournament' ? (a.rank ?? 0) - (b.rank ?? 0) || b.stack - a.stack : b.net - a.net);
  const control = (operation: 'start' | 'pause' | 'resume' | 'end' | 'lastHand' | 'cancelLastHand') => void commands.run('sessionControl', { operation });
  return <Dialog title={t(view.session.ended ? 'Final results' : 'Around the table')} onClose={onClose} className="session-dialog">
    <div className="flex justify-between items-center"><div><p className="eyebrow">{t(view.settings.mode === 'tournament' ? 'TOURNAMENT' : 'THIS SESSION')}</p></div><button className="ui-button" onClick={onClose}>{t('Close')}</button></div>
    <p className="text-sm text-white/50 mt-3 mb-4">{t(view.settings.mode === 'tournament' ? 'Equal starting chips. No late entries or rebuys.' : 'Buy-in includes all rebuys. Net = chips + chips taken out − buy-in.')}</p>
    <div className="session-scroll"><table className="session-ledger"><thead><tr><th>{t('Player')}</th>{view.settings.mode === 'tournament' ? <><th>{t('Chips')}</th><th>{t('Place')}</th></> : <><th>{t('Buy-in')}</th><th>{t('Out')}</th><th>{t('Chips')}</th><th>{t('Net')}</th></>}</tr></thead><tbody>{entries.map((e) => <tr key={e.userId}><td>{e.username}</td>{view.settings.mode === 'tournament' ? <><td>{(view.session.ended ? e.cashOut : e.stack).toLocaleString()}</td><td>{e.rank === 1 ? '♛ 1' : e.rank ?? t('Playing')}</td></> : <><td>{e.buyIn.toLocaleString()}</td><td>{e.cashOut.toLocaleString()}</td><td>{e.stack.toLocaleString()}</td><td className={e.net >= 0 ? 'positive' : 'negative'}>{e.net > 0 ? '+' : ''}{e.net.toLocaleString()}</td></>}</tr>)}</tbody></table></div>
    {live && <p className="text-xs text-white/40 mt-2">{t('Chips currently in the pot are included until this hand settles.')}</p>}
    {!view.session.ended && view.session.lastHand != null && <p className="text-sm text-amber-200 mt-4">{t(live ? 'This is the last hand. The session closes after settlement.' : 'One more hand, then the session closes. Close the results to continue.')}</p>}
    {view.session.ended && <div className="session-awards"><p className="eyebrow">{t('SESSION HIGHLIGHTS')}</p>
      {view.session.fun?.awards?.length ? view.session.fun.awards.map((award) => <div key={award.id} className="session-award">
        <strong>{t(award.title)}</strong><p className="text-xs text-white/45">{t(award.description)}</p>
        {award.recipients.map((player) => <p key={player.userId} className="award-recipient"><span>{player.username}</span><span>{t(player.detail)}</span></p>)}
      </div>) : <p className="text-sm text-white/45">{t('No qualifying highlights this session. Only settled hands count.')}</p>}
      {!!view.session.fun?.awards?.length && <p className="text-xs text-white/40">{t('Just for fun · Ties are shared · This session only')}</p>}
    </div>}
    {!!view.settings.levels.length && <details className="blind-structure"><summary>{t('Blind structure')} · {view.settings.levelMinutes} {t('min / level')}</summary>{view.settings.levels.map((level, i) => <div key={i} className={i === view.session.level ? 'current-level' : ''}>{t('Level')} {i + 1}<span>{level.smallBlind}/{level.bigBlind}</span></div>)}</details>}
    {view.isHost && !view.session.ended && <div className="host-controls"><p className="eyebrow">{t('HOST CONTROLS')}</p>
      {view.settings.mode === 'tournament' && !view.session.started && <button className="primary-button" disabled={busy} onClick={() => control('start')}>{t('Start tournament')}</button>}
      <button className="ui-button" disabled={busy} onClick={() => control(view.session.paused || view.session.pauseRequested ? 'resume' : 'pause')}>{t(view.session.paused ? 'Resume' : view.session.pauseRequested ? 'Cancel pause' : 'Pause after hand')}</button>
      {view.settings.mode === 'classic' && <button className="ui-button" disabled={busy} onClick={() => view.session.lastHand != null ? control('cancelLastHand') : setConfirmLast(true)}>{t(view.session.lastHand != null ? 'Cancel last hand' : 'Last hand')}</button>}
      <button className="ui-button" disabled={busy || live} onClick={() => setConfirmEnd(true)}>{t('End session')}</button>
      {view.players.filter((p) => !p.isConnected).map((p) => <button key={p.userId} className="ui-button" disabled={busy || live || (view.settings.mode === 'tournament' && view.session.started && p.stack > 0)} onClick={() => void commands.run('removeOffline', { userId: p.userId })}>{t('Remove offline:')} {p.username}</button>)}
    </div>}
    {view.session.ended && <p className="text-sm text-emerald-200 mt-5">{t('This session is closed. Create a new table in the lobby to start fresh.')}</p>}
    {confirmEnd && <ConfirmDialog title={t('Call it a night?')} text={t("End this session and record everyone's remaining chips. The table will close.")} confirmLabel={t('End session')} onCancel={() => setConfirmEnd(false)} onConfirm={() => { control('end'); setConfirmEnd(false); }} />}
    {confirmLast && <ConfirmDialog title={t('One last hand?')} text={t(live ? 'Finish this hand, settle the chips, then close this session. You can cancel before it settles.' : 'Play one more hand, settle the chips, then close this session. You can cancel before it settles.')} confirmLabel={t('Last hand')} onCancel={() => setConfirmLast(false)} onConfirm={() => { control('lastHand'); setConfirmLast(false); }} />}
  </Dialog>;
}
