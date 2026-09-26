import type { HandResult } from '@poker/shared';
import { PlayingCard } from './PlayingCard';

export function HandResultModal({
  result,
  onClose,
}: {
  result: HandResult;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 text-white rounded-2xl p-6 max-w-lg w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4 text-center">本局结果</h2>

        <div className="flex justify-center gap-1.5 mb-5 flex-wrap">
          {result.board.length > 0 ? (
            result.board.map((c, i) => <PlayingCard key={i} card={c} size="md" />)
          ) : (
            <span className="text-sm text-slate-400">无公共牌</span>
          )}
        </div>

        <div className="space-y-3">
          {result.winners.map((w, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-800 rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{w.username}</div>
                <div className="text-sm text-yellow-300">
                  {w.handName ?? (w.cards.length > 0 ? '已亮牌' : '其余玩家全部弃牌')}
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
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
