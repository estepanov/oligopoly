import { TOTAL_BOARD_MARKET_VALUE } from "../config/board.js";
import type { InternalGameState, LogEntry } from "./gameStateTypes.js";
import {
  findSyndicateWinnerId,
  getSyndicateForPlayer,
  sumOwnedTileMarketValue,
  syndicateMarketValue,
} from "./syndicate.js";
import { checkSoloWin } from "./winCondition.js";

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

export function applyWinIfThresholdCrossed(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  if (state.phase === "game_over") {
    return state;
  }

  const evaluation = evaluateWin(state);
  if (!evaluation) {
    return state;
  }

  state.winnerId = evaluation.winnerId;
  state.phase = "game_over";
  logs.push({
    playerId: evaluation.winnerId,
    actionType: "game_won",
    payload: {
      winnerId: evaluation.winnerId,
      type: evaluation.winType,
      marketValue: evaluation.marketValue,
      totalMarketValue: TOTAL_BOARD_MARKET_VALUE,
    },
  });

  return state;
}
