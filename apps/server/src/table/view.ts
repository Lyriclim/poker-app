import type { PlayerPublic, TableView, SessionSummary } from '@poker/shared';
import type { Table } from './table';
import { checkpoint, elapsed } from './session';

export function sessionSummaries(table: Table): SessionSummary[] {
  return [...table.entries.values()].map((entry) => {
    const player = table.game.players.find((p) => p.userId === entry.userId);
    const stack = table.session.ended ? 0 : (player?.stack ?? 0) + (table.game.status === 'playing' ? player?.totalBet ?? 0 : 0);
    return { ...entry, stack, net: stack + entry.cashOut - entry.buyIn };
  });
}

export function buildTableView(table: Table, userId: string, state: {
  saving: boolean; saveError: boolean; lastActionText: string | null;
  showdownDeadline: number | null;
}): TableView {
  const seatIndex = table.game.players.find((p) => p.userId === userId)?.seatIndex ?? null;
  const me = seatIndex === null ? undefined : table.game.getPlayer(seatIndex);
  const totalPot = table.game.players.reduce((s, p) => s + p.totalBet, 0);

  const players: PlayerPublic[] = table.game.players.map((p) => ({
    userId: p.userId,
    username: p.username,
    seatIndex: p.seatIndex,
    stack: p.stack,
    roundBet: p.roundBet,
    totalBet: p.totalBet,
    hasFolded: p.hasFolded,
    isAllIn: p.isAllIn,
    isSittingOut: p.isSittingOut,
    isConnected: p.isConnected,
    isInHand: p.isInHand,
    isReady: p.isReady,
  }));

  return {
    actionVersion: table.actionVersion,
    networkPaused: table.networkPaused,
    isHost: userId === table.createdBy,
    serverNow: Date.now(),
    canRaise: seatIndex !== null && table.game.canRaise(seatIndex),
    saving: state.saving,
    saveError: state.saveError,
    roomId: table.id,
    roomName: table.name,
    settings: table.settings,
    session: checkpoint(table.session),
    nextLevelAt: table.settings.levels.length > table.session.level + 1 && table.session.runningSince !== null ? Date.now() + Math.max(0, (table.session.level + 1) * table.settings.levelMinutes * 60_000 - elapsed(table.session)) : null,
    sessionPlayers: sessionSummaries(table),
    maxPlayers: table.maxPlayers,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    handNumber: table.game.handNumber,
    status: table.game.status,
    street: table.game.street,
    board: table.game.board,
    pots: table.game.computePots(),
    totalPot,
    currentBet: table.game.currentBet,
    minRaise: table.game.minRaise,
    betCount: table.game.betCount,
    burnCount: table.game.burnCount,
    dealerSeatIndex: table.game.dealerSeatIndex,
    smallBlindSeatIndex: table.game.smallBlindSeatIndex,
    bigBlindSeatIndex: table.game.bigBlindSeatIndex,
    actionSeatIndex: table.game.actionSeatIndex,
    players,
    yourSeatIndex: seatIndex,
    yourCards: me ? me.holeCards : [],
    lastActionText: state.lastActionText,
    showdown:
      table.game.status === 'showdown'
        ? {
          players: table.game.showdownReveals,
          allFolded: table.game.soleWinnerSeatIndex !== null,
          soleWinnerSeatIndex: table.game.soleWinnerSeatIndex,
          deadline: state.showdownDeadline,
        }
        : null,
  };
}
