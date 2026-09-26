import { useEffect, useState } from 'react';
import { raiseLabel, type ActionType, type TableView } from '@poker/shared';
import { getSocket } from '../socket';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// 快捷下注：四分之一池 / 半池 / 四分之三池 / 满池
const QUICK_BETS = [
  { label: '¼', frac: 0.25 },
  { label: '½', frac: 0.5 },
  { label: '¾', frac: 0.75 },
  { label: 'Pot', frac: 1 },
];

export function ActionBar({ view }: { view: TableView }) {
  const me = view.players.find((p) => p.seatIndex === view.yourSeatIndex);
  const isMyTurn = view.status === 'playing' && view.actionSeatIndex === view.yourSeatIndex;
  const showdown = view.showdown;

  const toCall = Math.max(0, view.currentBet - (me?.roundBet ?? 0));
  const maxBet = (me?.roundBet ?? 0) + (me?.stack ?? 0);
  const isBet = view.currentBet === 0;
  const minAmount = isBet ? view.bigBlind : view.currentBet + view.minRaise;
  const canRaise = maxBet >= minAmount;
  const canAllIn = maxBet > toCall;

  const [raiseTo, setRaiseTo] = useState(0);

  useEffect(() => {
    if (isMyTurn && canRaise) setRaiseTo(minAmount);
  }, [isMyTurn, view.currentBet, view.minRaise, view.bigBlind, canRaise, minAmount]);

  const emit = (type: ActionType, amount?: number) =>
    getSocket()?.emit('action', { type, amount });

  if (!me) {
    return (
      <div className="h-20 flex items-center justify-center text-slate-400 text-sm">
        Tap an empty seat to join
      </div>
    );
  }

  // 摊牌阶段：展示手牌 + 确认
  if (showdown) {
    // 全弃牌：只剩一个赢家，由其选择是否展示手牌
    if (showdown.allFolded) {
      if (showdown.soleWinnerSeatIndex === view.yourSeatIndex) {
        return (
          <div className="h-20 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-center gap-3">
            <span className="text-slate-200">Everyone folded. Show your hand?</span>
            <button
              onClick={() => getSocket()?.emit('showHand', { show: true })}
              className="h-12 px-5 rounded-lg bg-green-700 hover:bg-green-600 font-semibold"
            >
              Show hand
            </button>
            <button
              onClick={() => getSocket()?.emit('showHand', { show: false })}
              className="h-12 px-5 rounded-lg bg-slate-700 hover:bg-slate-600 font-semibold"
            >
              Muck
            </button>
          </div>
        );
      }
      return (
        <div className="h-20 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-center text-slate-400">
          Waiting for the winner to decide…
        </div>
      );
    }

    // 多人摊牌：所有入座的人都需点击跳过
    const hasAcked = showdown.ackedSeats.includes(view.yourSeatIndex as number);
    const total = view.players.length;
    const acked = showdown.ackedSeats.length;
    return (
      <div className="h-20 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-center gap-4">
        <span className="text-slate-300">
          Skipped {acked}/{total}
        </span>
        <button
          disabled={hasAcked}
          onClick={() => getSocket()?.emit('ackShowdown')}
          className={`h-12 px-8 rounded-lg font-semibold ${
            hasAcked
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {hasAcked ? 'Skipped' : 'Skip'}
        </button>
      </div>
    );
  }

  // 轮到你行动
  if (isMyTurn) {
    const raiseTotal = clamp(raiseTo, minAmount, maxBet);
    const raiseText = isBet
      ? `Bet ${raiseTotal}`
      : `${cap(raiseLabel(view.betCount + 1))} to ${raiseTotal}`;
    const pot = view.totalPot;
    const quickTo = (frac: number) =>
      clamp(Math.floor(isBet ? frac * pot : toCall + frac * (pot + toCall)), minAmount, maxBet);
    return (
      <div className="bg-slate-900/90 backdrop-blur border border-slate-700/70 rounded-2xl p-3 shadow-xl shadow-black/40">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center justify-center bg-slate-800 rounded-xl px-3 py-2 min-w-[92px] h-12 shrink-0">
            <span className="text-sm text-emerald-300 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Your turn
            </span>
          </div>

          <button
            onClick={() => emit('fold')}
            className="h-12 px-6 rounded-xl font-bold text-white bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 shadow-lg shadow-red-950/50 active:scale-95 transition"
          >
            Fold
          </button>

          {toCall === 0 ? (
            <button
              onClick={() => emit('check')}
              className="h-12 px-6 rounded-xl font-bold text-white bg-gradient-to-b from-sky-500 to-blue-700 hover:from-sky-400 hover:to-blue-600 shadow-lg shadow-blue-950/50 active:scale-95 transition"
            >
              Check
            </button>
          ) : (
            <button
              onClick={() => emit('call')}
              className="h-12 px-6 rounded-xl font-bold text-white bg-gradient-to-b from-sky-500 to-blue-700 hover:from-sky-400 hover:to-blue-600 shadow-lg shadow-blue-950/50 active:scale-95 transition"
            >
              Call {Math.min(toCall, me.stack)}
            </button>
          )}

          {canAllIn && (
            <button
              onClick={() => emit('allin')}
              className="h-12 px-6 rounded-xl font-bold text-white bg-gradient-to-b from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-950/50 active:scale-95 transition"
            >
              All-in {me.stack}
            </button>
          )}
        </div>

        {canRaise && (
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {QUICK_BETS.map(({ label, frac }) => (
              <button
                key={label}
                onClick={() => emit(isBet ? 'bet' : 'raise', quickTo(frac))}
                title={String(quickTo(frac))}
                className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white/80 transition whitespace-nowrap"
              >
                {label}
              </button>
            ))}
            <input
              type="range"
              min={minAmount}
              max={maxBet}
              step={Math.max(1, view.bigBlind)}
              value={clamp(raiseTo, minAmount, maxBet)}
              onChange={(e) => setRaiseTo(Number(e.target.value))}
              className="flex-1 min-w-[80px] accent-emerald-400"
            />
            <button
              onClick={() => emit(isBet ? 'bet' : 'raise', raiseTotal)}
              className="h-12 px-6 rounded-xl font-bold text-white bg-gradient-to-b from-emerald-500 to-green-700 hover:from-emerald-400 hover:to-green-600 shadow-lg shadow-green-950/50 active:scale-95 transition whitespace-nowrap"
            >
              {raiseText}
            </button>
          </div>
        )}
      </div>
    );
  }

  // 等待开局：准备
  if (view.status === 'waiting' || view.status === 'handover') {
    const readyCount = view.players.filter((p) => p.isReady).length;
    const total = view.players.length;
    return (
      <div className="h-20 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-center gap-4">
        <span className="text-slate-300">
          Ready {readyCount}/{total}
        </span>
        <button
          onClick={() => getSocket()?.emit('ready', { ready: !me.isReady })}
          className={`h-12 px-8 rounded-lg font-semibold ${
            me.isReady
              ? 'bg-slate-700 hover:bg-slate-600'
              : 'bg-green-600 hover:bg-green-500'
          }`}
        >
          {me.isReady ? 'Cancel ready' : 'Ready'}
        </button>
        <span className="text-slate-400 text-sm">Auto-starts when everyone is ready</span>
      </div>
    );
  }

  // 其余：进行中但未轮到自己
  return (
    <div className="h-20 bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-center text-slate-400">
      {view.status === 'playing' ? view.lastActionText ?? 'Waiting for other players…' : 'Ready for the next hand…'}
    </div>
  );
}
