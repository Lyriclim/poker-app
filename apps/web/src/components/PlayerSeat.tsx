import type { Card, PlayerPublic } from '@poker/shared';
import { PlayingCard } from './PlayingCard';
import { seatPosition } from '../lib/seatLayout';

function Badge({ color, children, title }: { color: string; children: string; title?: string }) {
  return (
    <span
      title={title}
      className={`${color} text-white text-[10px] font-bold rounded-full px-1.5 leading-4 shadow`}
    >
      {children}
    </span>
  );
}

interface Props {
  player: PlayerPublic;
  isYou: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isAction: boolean;
  holeCards: Card[] | null; // 只有「自己」或摊牌展示时非空
  handName?: string | null; // 摊牌阶段展示的牌型名
  isWinner?: boolean; // 摊牌阶段是否为赢家
  yourSeatIndex: number | null;
  maxPlayers: number;
  revealed: boolean; // 是否已翻出底牌（本人牌翻开时）
  showBacks: boolean; // 是否显示盖着的底牌
}

export function PlayerSeat({
  player,
  isYou,
  isDealer,
  isSmallBlind,
  isBigBlind,
  isAction,
  holeCards,
  handName,
  isWinner,
  yourSeatIndex,
  maxPlayers,
  revealed,
  showBacks,
}: Props) {
  const pos = seatPosition(player.seatIndex, yourSeatIndex, maxPlayers);
  const initial = (player.username || '?').slice(0, 1).toUpperCase();

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      {/* 手牌 */}
      <div className="flex flex-col gap-1 items-center">
        <div className="flex gap-0.5 min-h-[40px] items-end">
          {revealed && holeCards && holeCards.length === 2 ? (
            <>
              <PlayingCard card={holeCards[0]} size="lg" reveal />
              <PlayingCard card={holeCards[1]} size="lg" reveal />
            </>
          ) : showBacks && player.isInHand && !player.hasFolded ? (
            <>
              <PlayingCard faceDown size={isYou ? 'lg' : 'sm'} />
              <PlayingCard faceDown size={isYou ? 'lg' : 'sm'} />
            </>
          ) : null}
        </div>
        {handName && (
          <div className="text-[10px] font-bold text-amber-300 bg-black/60 rounded-full px-1.5 whitespace-nowrap shadow">
            {isWinner ? '🏆 ' : ''}
            {handName}
          </div>
        )}
      </div>

      {/* 玩家信息 */}
      <div
        className={`relative rounded-xl px-2.5 py-1.5 text-center text-white shadow-lg backdrop-blur transition ${
          player.hasFolded ? 'bg-slate-700/70 opacity-45' : 'bg-slate-900/90'
        } ${isAction ? 'ring-2 ring-yellow-400 shadow-yellow-500/30' : ''} ${
          isYou ? 'ring-1 ring-emerald-400/70' : ''
        }`}
      >
        <div className="flex items-center justify-center gap-1.5">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${
              player.isConnected ? 'bg-emerald-600' : 'bg-gray-500'
            }`}
          >
            {initial}
          </span>
          <span className="text-xs font-semibold max-w-[72px] truncate">{player.username}</span>
        </div>

        <div className="flex items-center justify-center gap-1 mt-0.5">
          {isDealer && <Badge color="bg-yellow-500" title="庄家">D</Badge>}
          {isSmallBlind && <Badge color="bg-blue-500" title="小盲">SB</Badge>}
          {isBigBlind && <Badge color="bg-red-500" title="大盲">BB</Badge>}
          {player.isSittingOut && <Badge color="bg-slate-500" title="暂离">暂离</Badge>}
        </div>

        <div className="text-[11px] text-yellow-200 font-mono mt-0.5">
          <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 mr-1 align-middle" />
          {player.stack}
        </div>

        {player.roundBet > 0 && (
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[11px] font-bold text-yellow-300 bg-black/80 rounded-full px-2 leading-4 whitespace-nowrap shadow">
            {player.roundBet}
          </div>
        )}
      </div>

      {player.isAllIn && (
        <span className="text-[10px] font-bold text-red-300 bg-red-950/60 rounded-full px-1.5 leading-4">
          ALL-IN
        </span>
      )}
    </div>
  );
}
