import { TOTAL_BOARD_MARKET_VALUE } from "../config/board.js";
import type { InternalGameState, LogEntry } from "./gameStateMachine.js";
import {
  findSyndicateWinnerId,
  getSyndicateForPlayer,
  syndicateMarketValue,
  sumOwnedTileMarketValue,
} from "./syndicate.js";
import { checkSoloWin } from "./winCondition.js";

export function playerMarketValue(
  state: InternalGameState,
  playerId: string,
): number {
  return sumOwnedTileMarketValue(state, [playerId]);
}

export function checkWinConditions(state: InternalGameState): string | null {
  const syndicateWinner = findSyndicateWinnerId(
    state,
    TOTAL_BOARD_MARKET_VALUE,
  );
  if (syndicateWinner) {
    return syndicateWinner;
  }

  for (const player of state.players) {
    if (state.eliminatedPlayerIds.includes(player.playerId)) continue;
    if (getSyndicateForPlayer(state, player.playerId)) continue;
    const marketValue = playerMarketValue(state, player.playerId);
    if (checkSoloWin(marketValue, TOTAL_BOARD_MARKET_VALUE)) {
      return player.playerId;
    }
  }

  const activePlayers = state.players.filter(
    (player) => !state.eliminatedPlayerIds.includes(player.playerId),
  );
  if (activePlayers.length === 1) {
    return activePlayers[0].playerId;
  }
  return null;
}

function winningMarketValue(
  state: InternalGameState,
  winnerId: string,
): number {
  const syndicate = getSyndicateForPlayer(state, winnerId);
  if (syndicate && findSyndicateWinnerId(state, TOTAL_BOARD_MARKET_VALUE)) {
    return syndicateMarketValue(state, syndicate.memberIds);
  }
  return playerMarketValue(state, winnerId);
}

export function winTypeForPlayer(
  state: InternalGameState,
  winnerId: string,
): "syndicate" | "solo" | "last_standing" {
  const syndicate = getSyndicateForPlayer(state, winnerId);
  if (syndicate && findSyndicateWinnerId(state, TOTAL_BOARD_MARKET_VALUE)) {
    return "syndicate";
  }

  const activePlayers = state.players.filter(
    (player) => !state.eliminatedPlayerIds.includes(player.playerId),
  );
  if (
    activePlayers.length === 1 &&
    activePlayers[0].playerId === winnerId &&
    !checkSoloWin(playerMarketValue(state, winnerId), TOTAL_BOARD_MARKET_VALUE)
  ) {
    return "last_standing";
  }
  return "solo";
}

export function applyWinIfThresholdCrossed(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  if (state.phase === "game_over") {
    return state;
  }

  const winnerId = checkWinConditions(state);
  if (!winnerId) {
    return state;
  }

  state.winnerId = winnerId;
  state.phase = "game_over";
  logs.push({
    playerId: winnerId,
    actionType: "game_won",
    payload: {
      winnerId,
      type: winTypeForPlayer(state, winnerId),
      marketValue: winningMarketValue(state, winnerId),
      totalMarketValue: TOTAL_BOARD_MARKET_VALUE,
    },
  });

  return state;
}
