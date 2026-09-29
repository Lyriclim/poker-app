import { spendsEntireStack, raiseLabel } from '@poker/shared';
import { useTableCommand } from '../lib/useTableCommand';
import { useEffect, useState } from 'react';
import type { ActionType, TableView } from '@poker/shared';
import { ConfirmDialog } from './ConfirmDialog';
import { formatChips, useChips } from '../store/chips';
import { useT } from '../i18n';
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const QUICK_BETS = [{ label: '¼', frac: .25 }, { label: '½', frac: .5 }, { label: '¾', frac: .75 }, { label: 'Pot', frac: 1 }];
export function ActionBar({ view, onRebuy }: { view: TableView; onRebuy: () => void }) {
  const t = useT();
  const me = view.players.find((p) => p.seatIndex === view.yourSeatIndex);
  const myTurn = view.status === 'playing' && view.actionSeatIndex === view.yourSeatIndex;
  const toCall = Math.max(0, view.currentBet - (me?.roundBet ?? 0));
  const max = (me?.roundBet ?? 0) + (me?.stack ?? 0);
  const isBet = view.currentBet === 0;
  const min = isBet ? view.bigBlind : view.currentBet + view.minRaise;
  const canRaise = max >= min && view.canRaise;
  const fifteenTo = isBet ? 15 : view.currentBet + 15;
  const canFifteen = view.canRaise && fifteenTo <= max && (fifteenTo >= min || fifteenTo === max);
  const canAllIn = (me?.stack ?? 0) > 0 && (max <= view.currentBet || view.canRaise);
  const { pending, run } = useTableCommand();
  const [amount, setAmount] = useState('');
  const [confirm, setConfirm] = useState<{ type: ActionType; amount?: number } | null>(null);
  const inBB = useChips((s) => s.inBB);
  const fmt = (value: number) => formatChips(value, view.bigBlind, inBB);
  useEffect(() => { if (myTurn && canRaise) setAmount(String(min)); }, [myTurn, canRaise, min, view.handNumber, view.street]);
  useEffect(() => { setConfirm(null); }, [view.actionVersion, view.handNumber, view.street, view.currentBet, myTurn, me?.stack]);
  const submit = (type: ActionType, chips?: number) => run('action', {
    type, amount: chips, roomId: view.roomId, actionVersion: view.actionVersion,
  });
  const emit = (type: ActionType, chips?: number) => {
    if (pending) return;
    if (spendsEntireStack(type, chips, me?.stack ?? 0, me?.roundBet ?? 0, view.currentBet)) { setConfirm({ type, amount: chips }); return; }
    void submit(type, chips);
  };
  if (view.saving || view.saveError) return <div className="action-notice" role="status">{t(view.saving ? 'Saving this hand…' : 'Could not save this hand. Results are not saved yet.')}{view.saveError && (me || view.isHost) && <button disabled={pending} className="ui-button" onClick={() => void run('retrySave')}>{t('Retry save')}</button>}</div>;
  if (view.session.ended) return <div className="action-notice">{t('Session complete. View Session for results, or create a new table in the lobby.')}</div>;
  if (view.networkPaused) return <div className="action-notice" role="status"><span>{t('Session held after everyone disconnected. Cards and chips are preserved.')}</span>{view.isHost ? <button className="ui-button" disabled={pending || view.players.filter((p) => p.isConnected && (view.status === 'playing' || view.status === 'showdown' ? p.isInHand : p.stack > 0)).length < 2} onClick={() => void run('sessionControl', { operation: 'resume' })}>{t('Resume with two players online')}</button> : <span>{t('Waiting for the host to resume.')}</span>}</div>;
  if (!me) return <div className="action-notice">{t(view.settings.mode === 'tournament' && view.session.started ? 'Tournament in progress · Watching' : 'Tap an empty seat to join')}</div>;
  if (!me.isInHand && me.stack === 0) return <div className="action-notice">{view.settings.mode === 'classic' ? <><span>{t('Fresh chips. Same seat.')}</span><button onClick={onRebuy} className="primary-button">{t('Rebuy & Next hand')}</button></> : t('You are eliminated. Stay to watch the finish.')}</div>;
  if (!me.isInHand && (view.status === 'playing' || view.status === 'showdown')) return <div className="action-notice">{t('Your first hand starts next round.')}</div>;
  if (view.showdown) {
    const show = view.showdown;
    if (show.allFolded) return <div className="action-notice">{show.soleWinnerSeatIndex === view.yourSeatIndex ? <><span>{t('Everyone folded. Show your hand?')}</span><button className="ui-button" onClick={() => void run('showHand', { show: true })}>{t('Show hand')}</button><button className="ui-button" onClick={() => void run('showHand', { show: false })}>{t('Muck')}</button></> : t('Waiting for the winner…')}</div>;
    return <div className="action-notice"><span>{t('Showing cards… Results are on their way.')}</span></div>;
  }
  if (myTurn) {
    const total = Number(amount);
    const level = raiseLabel(view.betCount + 1);
    const raiseVerb = isBet ? 'Bet' : level === 'raise' ? 'Raise to' : `${level} to`;
    const quickTo = (frac: number) => clamp(Math.floor(me.roundBet + toCall + frac * (view.totalPot + toCall)), min, max);
    return <fieldset disabled={pending} className="bet-controls" aria-busy={pending}><div className="quick-bets">
      {QUICK_BETS.map(({ label, frac }) => <button key={label} disabled={!canRaise} onClick={() => emit(isBet ? 'bet' : 'raise', quickTo(frac))} title={`Total ${quickTo(frac)}`}>{label}</button>)}
      <button disabled={!canFifteen} title={`${t('Total')} ${fifteenTo}`} onClick={() => fifteenTo < min && fifteenTo === max ? emit('allin') : emit(isBet ? 'bet' : 'raise', fifteenTo)}>+15</button><button className="allin-shortcut" disabled={!canAllIn} onClick={() => emit('allin')}>{t('All-in')}</button>
    </div>{canRaise && <div className="bet-sizing"><input type="range" aria-label={t('Bet amount slider')} min={min} max={max} step={1} value={clamp(Number(amount), min, max)} onChange={(e) => setAmount(e.target.value)} /><label><span>{t(raiseVerb)}</span><input type="number" inputMode="numeric" aria-label={t('Bet amount')} min={min} max={max} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => setAmount(String(clamp(Math.round(Number(amount)), min, max)))} /></label></div>}
      <div className="primary-actions"><button className="fold-button" onClick={() => emit('fold')}>{t('Fold')}</button><button className="call-button" onClick={() => emit(toCall === 0 ? 'check' : 'call')}>{toCall === 0 ? t('Check') : `${t('Call')} ${fmt(Math.min(toCall, me.stack))}`}</button>{canRaise ? <button className="raise-button" disabled={amount === '' || !Number.isSafeInteger(total) || total < min || total > max} onClick={() => emit(isBet ? 'bet' : 'raise', total)}>{t(raiseVerb)} {fmt(total || min)}</button> : canAllIn ? <button className="raise-button" onClick={() => emit('allin')}>{t('All-in')} {fmt(me.stack)}</button> : null}</div>
      {confirm && <ConfirmDialog title={t('Take a breath.')} text={t("You're going all-in with {chips} chips. Ready?", { chips: me.stack.toLocaleString() })} confirmLabel={t('Go all-in')} onCancel={() => setConfirm(null)} onConfirm={() => { if (myTurn && canAllIn) void submit(confirm.type, confirm.amount); setConfirm(null); }} />}</fieldset>;
  }
  if (view.status === 'waiting' || view.status === 'handover') {
    const eligible = view.players.filter((p) => p.isConnected && p.stack > 0 && !p.isSittingOut);
    const firstHand = view.handNumber === 0;
    return <div className="action-notice"><span>{view.session.paused ? t('Session paused') : `${t('Continuing')} ${eligible.filter((p) => p.isReady).length}/${eligible.length}`}</span><button disabled={pending} className={me.isReady ? 'ui-button' : 'primary-button'} onClick={() => void run('ready', { ready: !me.isReady })}>{t(me.isReady ? 'Take a break' : firstHand ? 'Ready to start' : 'Join next hand')}</button><span className="ready-hint">{t(firstHand && view.settings.mode === 'tournament' && !view.session.started ? 'The host starts when everyone is ready.' : firstHand ? 'The first hand starts when everyone is ready.' : 'The next hand starts when everyone has closed their results.')}</span></div>;
  }
  return <div className="action-notice">{t(view.lastActionText ?? 'Waiting for other players…')}</div>;
}
