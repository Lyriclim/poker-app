import type { Card } from '@poker/shared';
import { SUIT_LABELS, rankToLabel } from '@poker/shared';

const SIZES = {
  sm: { box: 'w-7 h-10 rounded', idx: 'text-[9px]', center: 'text-sm' },
  md: { box: 'w-10 h-14 rounded-md', idx: 'text-[11px]', center: 'text-lg' },
  lg: { box: 'w-14 h-20 rounded-lg', idx: 'text-sm', center: 'text-2xl' },
} as const;

export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  reveal = false,
}: {
  card?: Card | null;
  faceDown?: boolean;
  size?: keyof typeof SIZES;
  reveal?: boolean;
}) {
  const s = SIZES[size];

  if (faceDown || !card) {
    return <div className={`${s.box} card-back`} />;
  }

  const red = card.suit === 'h' || card.suit === 'd';
  const rank = rankToLabel(card.rank);
  const suit = SUIT_LABELS[card.suit];
  const color = red ? 'text-red-600' : 'text-slate-900';

  return (
    <div
      className={`${s.box} relative bg-white border border-slate-200 shadow-md select-none ${color} ${
        reveal ? 'card-reveal' : ''
      }`}
    >
      <div className={`absolute top-0.5 left-1 leading-none font-bold ${s.idx}`}>
        <div>{rank}</div>
        <div className="-mt-0.5">{suit}</div>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center ${s.center}`}>
        {suit}
      </div>
      <div className={`absolute bottom-0.5 right-1 leading-none font-bold ${s.idx} rotate-180`}>
        <div>{rank}</div>
        <div className="-mt-0.5">{suit}</div>
      </div>
    </div>
  );
}
