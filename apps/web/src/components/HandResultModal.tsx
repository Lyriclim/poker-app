import { Dialog } from './Dialog';
import type { HandResult } from '@poker/shared';
import { PlayingCard } from './PlayingCard';
import { useT } from '../i18n';

export function HandResultModal({
  result,
  onClose,
  onContinue,
  onRebuy,
  onLeave,
  busy = false,
}: {
  result: HandResult;
  onClose: () => void;
  onContinue?: () => void;
  onRebuy?: () => void;
  onLeave?: () => void;
  busy?: boolean;
}) {
  const t = useT();
  return (
    <Dialog title={`${t('Hand')} ${result.handNumber} · ${t('Result')}`} onClose={onClose} className="result-dialog" busy={busy}>
      <p className="text-center text-amber-200 mb-4">{t('Total pot')} {result.totalPot.toLocaleString()}</p>
      {result.pots && result.pots.length > 0 && <div className="mb-4 text-sm text-white/60">{result.pots.map((pot, i) => <div key={i} className="py-2 border-b border-white/10"><div className="flex justify-between"><span>{i === 0 ? t('Main pot') : `${t('Side pot')} ${i}`}</span><span>{pot.amount.toLocaleString()}</span></div><p className="text-xs text-emerald-200 mt-1">{result.winners.filter((w) => (w.potIndex ?? 0) === i).map((w) => `${w.username} +${w.amount.toLocaleString()}`).join(' · ')}</p></div>)}</div>}

      <div className="flex justify-center gap-1.5 mb-5 flex-wrap">
        {result.board.length > 0 ? (
          result.board.map((c, i) => <PlayingCard key={i} card={c} size="md" />)
        ) : (
          <span className="text-sm text-slate-400">{t('No community cards')}</span>
        )}
      </div>

      <div className="space-y-3">
        {result.winners.map((w, i) => (
          <div key={i} className="flex items-center justify-between bg-slate-800 rounded-xl p-3">
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{w.username}</div>
              <div className="text-sm text-yellow-300">
                {t(w.handName ?? (w.cards.length > 0 ? 'Cards shown' : 'Everyone else folded'))}
              </div>
              {w.cards.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {w.cards.map((c, j) => (
                    <PlayingCard key={j} card={c} size="sm" />
                  ))}
                </div>
              )}
            </div>
            <div className="text-2xl font-bold text-green-400 shrink-0 ml-3">+{w.amount}</div>
          </div>
        ))}
      </div>

      <button
        className="mt-5 w-full bg-green-600 hover:bg-green-500 rounded-lg py-2 font-semibold"
        disabled={busy}
        onClick={onRebuy ?? onContinue ?? onClose}
      >
        {t(onRebuy ? 'Rebuy & Next hand' : onContinue ? 'Next hand' : 'Close')}
      </button>
      {(onContinue || onLeave) && <button className="mt-2 w-full text-sm text-white/50 py-2" disabled={busy} onClick={onLeave ?? onClose}>{t(onLeave ? 'Leave seat' : 'Take a break')}</button>}
    </Dialog>
  );
}
