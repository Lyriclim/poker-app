import { canJoinTable } from '@poker/shared';
import type { TableView } from '@poker/shared';
import type { DealState } from '../lib/useDealAnimation';
import { PlayingCard } from './PlayingCard';
import { formatChips, useChips } from '../store/chips';
import { useT } from '../i18n';

type SeatSlot = { seat: number; position: string; left?: string; width?: string };

function tableSlots(maxPlayers: number, anchor: number): SeatSlot[] {
  const others = Array.from({ length: maxPlayers - 1 }, (_, i) => (anchor + i + 1) % maxPlayers);
  const topCount = maxPlayers === 2 || maxPlayers === 4 || maxPlayers === 6 ? 1
    : maxPlayers === 8 ? 3 : maxPlayers === 9 ? 4 : 2;
  const perSide = (others.length - topCount) / 2;
  const slots: SeatSlot[] = [];

  // Seat numbers advance clockwise: bottom → left → top → right.
  for (let i = 0; i < perSide; i++) {
    slots.push({ seat: others[i], position: `left ${perSide === 1 ? 'side-one' : i === 0 ? 'side-lower' : 'side-upper'}` });
  }
  const topWidth = topCount === 4 ? '22%' : topCount === 3 ? '27%' : '28%';
  for (let i = 0; i < topCount; i++) {
    slots.push({ seat: others[perSide + i], position: 'top', left: `${((i + .5) * 100) / topCount}%`, width: topWidth });
  }
  for (let i = 0; i < perSide; i++) {
    slots.push({ seat: others[perSide + topCount + i], position: `right ${perSide === 1 ? 'side-one' : i === 0 ? 'side-upper' : 'side-lower'}` });
  }
  return slots;
}

export function MobileTable({ view, deal, onSit, bubbles }: {
  view: TableView; deal: DealState; onSit: (seat: number) => void;
  bubbles: { key: number; seatIndex: number; text: string }[];
}) {
  const t = useT();
  const inBB = useChips((s) => s.inBB);
  const fmt = (value: number) => formatChips(value, view.bigBlind, inBB);
  const anchor = view.yourSeatIndex ?? 0;
  const actionPlayer = view.players.find((p) => p.seatIndex === view.actionSeatIndex);
  const myTurn = view.yourSeatIndex !== null && view.status === 'playing' && view.actionSeatIndex === view.yourSeatIndex;
  const actionText = view.status === 'playing'
    ? myTurn ? t('Your turn') : actionPlayer ? `${actionPlayer.username} ${t('is acting')}` : t('Waiting for action')
    : view.status === 'showdown' ? t('Showing cards') : t('Waiting for action');
  const lowCount = view.maxPlayers <= 3;

  const renderSeat = (seat: number, position: string, own: boolean, style?: React.CSSProperties) => {
    const p = view.players.find((player) => player.seatIndex === seat);
    const reveal = view.showdown?.players.find((player) => player.seatIndex === seat);
    const cards = reveal?.holeCards ?? (own ? view.yourCards : []);
    const bubble = bubbles.filter((item) => item.seatIndex === seat).at(-1);
    const acting = view.status === 'playing' && view.actionSeatIndex === seat;
    const role = seat === view.dealerSeatIndex ? 'D' : seat === view.smallBlindSeatIndex ? 'SB' : seat === view.bigBlindSeatIndex ? 'BB' : '';
    const status = p && !p.isConnected ? t('Offline') : acting ? t('Acting') : p?.isAllIn ? t('All-in') : p?.isReady ? t('Continuing') : '';
    return <div key={seat} style={style} className={`phone-seat ${position} ${own ? 'self' : ''} ${acting ? 'acting' : ''} ${p?.hasFolded ? 'folded' : ''}`}>
      {p ? <>
        {bubble && <div className="phone-bubble">{bubble.text}</div>}
        {role && <span className="phone-seat-role">{role}</span>}
        <div className="phone-seat-info">
          <div className="phone-seat-top"><span className="phone-avatar" aria-hidden="true">{own ? '♠' : p.username.slice(0, 1)}</span><strong title={p.username}>{p.username}</strong></div>
          <span className="phone-seat-stack">{fmt(p.stack)}</span>
          {own && <span className="phone-own-detail">{status || (p.roundBet > 0 ? `${t('Bet')} ${fmt(p.roundBet)}` : '')}</span>}
        </div>
        {(own || reveal) && cards.length === 2 && deal.holesRevealed && <div className="phone-hole-cards">{cards.map((card, i) => <PlayingCard key={i} card={card} size={own ? 'lg' : 'sm'} reveal />)}</div>}
        {!own && !reveal && p.isInHand && !p.hasFolded && deal.holesDealt && <div className="phone-hole-cards"><PlayingCard faceDown size="sm" /><PlayingCard faceDown size="sm" /></div>}
        {!own && status && <span className="phone-seat-status">{status}</span>}
        {!own && p.roundBet > 0 && <span className="phone-seat-bet">{t('Bet')} {fmt(p.roundBet)}</span>}
        {reveal && <span className="phone-hand-name">{reveal.isWinner ? '★ ' : ''}{t(reveal.handName ?? '')}</span>}
      </> : <button onClick={() => onSit(seat)} disabled={!canJoinTable(view)} className="phone-empty">+ {t('Seat')} {seat + 1}</button>}
    </div>;
  };

  return <main className={`mobile-table ${lowCount ? 'low-count' : ''}`} aria-label={t('Poker table')}>
    <div className="phone-table-outline" aria-hidden="true" />
    <div className={`phone-table-indicator ${myTurn ? 'yours' : ''}`} role="status">{actionText}</div>
    <div className="phone-opponents">{tableSlots(view.maxPlayers, anchor).map(({ seat, position, left, width }) => renderSeat(seat, position, false, { left, width }))}</div>
    <div className="phone-center">
      <div className="phone-pot"><span>{t('Pot')}</span><strong>{fmt(view.totalPot)}</strong></div>
      <div className="phone-board-cards">
        {[0, 1, 2, 3, 4].map((i) => view.board[i] ? <PlayingCard key={i} card={view.board[i]} faceDown={i >= deal.boardRevealed} size="md" reveal /> : <div key={i} className="phone-empty-card" />)}
      </div>
      {view.lastActionText && <p className="phone-last-action">{t(view.lastActionText)}</p>}
    </div>
    <div className="phone-self">{renderSeat(anchor, '', view.yourSeatIndex !== null)}</div>
  </main>;
}
