import { TOTAL_BOARD_MARKET_VALUE } from "../config/board.js";
import type {
  InternalGameState,
  LogEntry,
  WinSummaryState,
} from "./gameStateTypes.js";
import {
  findSyndicateWinnerId,
  getSyndicateForPlayer,
  sumOwnedTileMarketValue,
  syndicateMarketValue,
} from "./syndicate.js";
import {
  checkSoloWin,
  checkSyndicateWin,
  SOLO_WIN_THRESHOLD,
  SYNDICATE_WIN_THRESHOLD,
} from "./winCondition.js";

export function playerMarketValue(
  state: InternalGameState,
  playerId: string,
): number {
  return sumOwnedTileMarketValue(state, [playerId]);
}

export interface WinEvaluation {
  winnerId: string;
  winType: "syndicate" | "solo" | "last_standing";
  marketValue: number;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildWinSummary(
  state: InternalGameState,
  evaluation: WinEvaluation,
): WinSummaryState {
  const marketShare = evaluation.marketValue / TOTAL_BOARD_MARKET_VALUE;
  const syndicate = getSyndicateForPlayer(state, evaluation.winnerId);
  const thresholdShare =
    evaluation.winType === "syndicate"
      ? SYNDICATE_WIN_THRESHOLD
      : evaluation.winType === "solo"
        ? SOLO_WIN_THRESHOLD
        : undefined;
  const thresholdMarketValue =
    thresholdShare === undefined
      ? undefined
      : Math.ceil(TOTAL_BOARD_MARKET_VALUE * thresholdShare);
  const reason =
    evaluation.winType === "last_standing"
      ? "Won as the last non-eliminated player."
      : evaluation.winType === "syndicate"
        ? `Syndicate controlled ${evaluation.marketValue} of ${TOTAL_BOARD_MARKET_VALUE} market value (${formatPercent(marketShare)}), meeting the ${formatPercent(SYNDICATE_WIN_THRESHOLD)} syndicate threshold after final-round checks.`
        : `Controlled ${evaluation.marketValue} of ${TOTAL_BOARD_MARKET_VALUE} market value (${formatPercent(marketShare)}), meeting the ${formatPercent(SOLO_WIN_THRESHOLD)} solo threshold.`;

  return {
    winnerId: evaluation.winnerId,
    winType: evaluation.winType,
    reason,
    marketValue: evaluation.marketValue,
    totalMarketValue: TOTAL_BOARD_MARKET_VALUE,
    marketShare,
    thresholdMarketValue,
    thresholdShare,
    syndicateId: syndicate?.syndicateId,
    memberIds: syndicate?.memberIds,
  };
}

export function evaluateWin(state: InternalGameState): WinEvaluation | null {
  const syndicateWinner = findSyndicateWinnerId(
    state,
    TOTAL_BOARD_MARKET_VALUE,
  );
  if (syndicateWinner) {
    const syndicate = getSyndicateForPlayer(state, syndicateWinner);
    return {
      winnerId: syndicateWinner,
      winType: "syndicate",
      marketValue: syndicate
        ? syndicateMarketValue(state, syndicate.memberIds)
        : playerMarketValue(state, syndicateWinner),
    };
  }

  for (const player of state.players) {
    if (state.eliminatedPlayerIds.includes(player.playerId)) continue;
    if (getSyndicateForPlayer(state, player.playerId)) continue;
    const marketValue = playerMarketValue(state, player.playerId);
    if (checkSoloWin(marketValue, TOTAL_BOARD_MARKET_VALUE)) {
      return {
        winnerId: player.playerId,
        winType: "solo",
        marketValue,
      };
    }
  }

  const activePlayers = state.players.filter(
    (player) => !state.eliminatedPlayerIds.includes(player.playerId),
  );
  if (activePlayers.length === 1) {
    const winnerId = activePlayers[0].playerId;
    const marketValue = playerMarketValue(state, winnerId);
    return {
      winnerId,
      winType: checkSoloWin(marketValue, TOTAL_BOARD_MARKET_VALUE)
        ? "solo"
        : "last_standing",
      marketValue,
    };
  }

  return null;
}

export function checkWinConditions(state: InternalGameState): string | null {
  return evaluateWin(state)?.winnerId ?? null;
}

export function playerWonGame(
  state: InternalGameState,
  playerId: string,
  winnerId: string,
): boolean {
  if (playerId === winnerId) {
    return true;
  }
  const winner = state.players.find((entry) => entry.playerId === winnerId);
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!winner?.syndicateId || !player?.syndicateId) {
    return false;
  }
  return winner.syndicateId === player.syndicateId;
}

function finalRoundOpponents(
  state: InternalGameState,
  winnerId: string,
): string[] {
  const winnerSyndicate = getSyndicateForPlayer(state, winnerId);
  const opponents = new Set<string>();
  for (const player of state.players) {
    if (state.eliminatedPlayerIds.includes(player.playerId)) continue;
    if (player.playerId === winnerId) continue;
    if (winnerSyndicate?.memberIds.includes(player.playerId)) continue;
    if (
      player.syndicateId &&
      player.syndicateId === winnerSyndicate?.syndicateId
    ) {
      continue;
    }
    opponents.add(player.playerId);
  }
  return [...opponents];
}

export function triggerFinalRoundIfNeeded(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  if (state.finalRound || state.phase === "game_over") {
    return state;
  }

  const evaluation = evaluateWin(state);
  if (!evaluation || evaluation.winType === "last_standing") {
    return state;
  }

  if (evaluation.winType !== "syndicate") {
    return finalizeWin(state, evaluation, logs);
  }

  if (!checkSyndicateWin(evaluation.marketValue, TOTAL_BOARD_MARKET_VALUE)) {
    return state;
  }

  const remaining = finalRoundOpponents(state, evaluation.winnerId);
  if (remaining.length === 0) {
    return finalizeWin(state, evaluation, logs);
  }

  state.finalRound = {
    pendingWinnerId: evaluation.winnerId,
    winType: "syndicate",
    remainingTurnPlayerIds: remaining,
  };
  logs.push({
    playerId: evaluation.winnerId,
    actionType: "final_round_started",
    payload: {
      remainingTurnPlayerIds: remaining,
      winType: evaluation.winType,
    },
  });
  return state;
}

export function markFinalRoundTurnComplete(
  state: InternalGameState,
  playerId: string,
  logs: LogEntry[],
): InternalGameState {
  const finalRound = state.finalRound;
  if (!finalRound) return state;

  finalRound.remainingTurnPlayerIds = finalRound.remainingTurnPlayerIds.filter(
    (id) => id !== playerId,
  );

  if (finalRound.remainingTurnPlayerIds.length > 0) {
    return state;
  }

  const evaluation = evaluateWin(state);
  if (!evaluation) {
    state.finalRound = null;
    logs.push({
      playerId: null,
      actionType: "final_round_ended",
      payload: { reason: "threshold_not_met" },
    });
    return state;
  }

  return finalizeWin(state, evaluation, logs);
}

function finalizeWin(
  state: InternalGameState,
  evaluation: WinEvaluation,
  logs: LogEntry[],
): InternalGameState {
  const summary = buildWinSummary(state, evaluation);
  state.winnerId = evaluation.winnerId;
  state.phase = "game_over";
  state.finalRound = null;
  state.winSummary = summary;
  logs.push({
    playerId: evaluation.winnerId,
    actionType: "game_won",
    payload: { ...summary },
  });
  return state;
}

export function applyWinIfThresholdCrossed(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  if (state.phase === "game_over") {
    return state;
  }

  if (state.finalRound) {
    return state;
  }

  const evaluation = evaluateWin(state);
  if (!evaluation) {
    return state;
  }

  if (evaluation.winType === "syndicate") {
    return triggerFinalRoundIfNeeded(state, logs);
  }

  return finalizeWin(state, evaluation, logs);
}
