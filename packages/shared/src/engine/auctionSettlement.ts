import { getTileByPosition } from "../config/board.js";
import type { PendingAuctionState } from "./auctionTypes.js";
import { applyForeclosureAuctionProceeds } from "./foreclosure.js";
import type {
  ApplyActionResult,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { deepClone, getPlayer, transferTileOwnership } from "./stateUtils.js";
import { enterWaitingForRollForCurrentTurn } from "./turnPhase.js";
import { applyWinIfThresholdCrossed } from "./winResolution.js";

function clearPendingAuction(state: InternalGameState): InternalGameState {
  const newState = deepClone(state);
  newState.pendingAuction = undefined;
  return newState;
}

function transferTileToWinner(
  state: InternalGameState,
  auction: PendingAuctionState,
  winnerId: string,
  options: { removeFromSellerId?: string; clearMortgage: boolean },
): InternalGameState {
  const transferred = transferTileOwnership(
    state,
    options.removeFromSellerId ?? null,
    winnerId,
    auction.tilePosition,
    { clearMortgage: options.clearMortgage },
  );
  if (!transferred) {
    throw "game.invalid_player_state";
  }

  return state;
}

function removeForeclosedTileFromDebtor(
  state: InternalGameState,
  auction: PendingAuctionState,
): void {
  const pending = state.pendingForeclosure;
  if (!pending) return;

  const debtor = getPlayer(state, pending.debtorId);
  if (!debtor) return;

  debtor.ownedTilePositions = debtor.ownedTilePositions.filter(
    (pos) => String(pos) !== String(auction.tilePosition),
  );
  debtor.mortgagedTilePositions = debtor.mortgagedTilePositions.filter(
    (pos) => String(pos) !== String(auction.tilePosition),
  );
}

function logAuctionSettled(
  logs: LogEntry[],
  auction: PendingAuctionState,
  winnerId: string,
  amount: number,
): void {
  const tile = getTileByPosition(auction.tilePosition);
  logs.push({
    playerId: winnerId,
    actionType: "auction_settled",
    payload: {
      position: auction.tilePosition,
      name: tile?.name ?? "Unknown",
      amount,
      winnerId,
      trigger: auction.trigger,
      sellerId: auction.sellerId,
      submissions: auction.submissions,
    },
  });
}

function applyAuctionResumePhase(
  state: InternalGameState,
  resumePhase: PendingAuctionState["resumePhase"],
): void {
  if (resumePhase === "waiting_for_roll") {
    enterWaitingForRollForCurrentTurn(state);
    return;
  }
  state.phase = resumePhase;
}

function settleDeclineAuctionWithoutSale(
  state: InternalGameState,
  auction: PendingAuctionState,
  logs: LogEntry[],
): ApplyActionResult {
  const newState = clearPendingAuction(state);
  applyAuctionResumePhase(newState, auction.resumePhase);
  return { state: newState, logEntries: logs };
}

function settleForeclosureAuctionWithoutSale(
  state: InternalGameState,
  logs: LogEntry[],
): ApplyActionResult {
  const newState = clearPendingAuction(state);
  if (!newState.pendingForeclosure) {
    return { state: newState, logEntries: logs };
  }
  const workingState = applyForeclosureAuctionProceeds(newState, 0, logs);
  return { state: workingState, logEntries: logs };
}

function settleDeclineAuctionWinner(
  state: InternalGameState,
  auction: PendingAuctionState,
  winnerId: string,
  amount: number,
  logs: LogEntry[],
): ApplyActionResult {
  let newState = clearPendingAuction(state);
  const winner = getPlayer(newState, winnerId);
  if (!winner || winner.capital < amount) {
    throw winner ? "game.insufficient_capital" : "game.invalid_player_state";
  }

  winner.capital -= amount;
  newState = transferTileToWinner(newState, auction, winnerId, {
    clearMortgage: false,
  });
  applyAuctionResumePhase(newState, auction.resumePhase);
  logAuctionSettled(logs, auction, winnerId, amount);
  applyWinIfThresholdCrossed(newState, logs);
  return { state: newState, logEntries: logs };
}

function settlePlayerInitiatedAuctionWinner(
  state: InternalGameState,
  auction: PendingAuctionState,
  winnerId: string,
  amount: number,
  logs: LogEntry[],
): ApplyActionResult {
  if (!auction.sellerId) {
    throw "game.invalid_action";
  }

  let newState = clearPendingAuction(state);
  const winner = getPlayer(newState, winnerId);
  if (!winner || winner.capital < amount) {
    throw winner ? "game.insufficient_capital" : "game.invalid_player_state";
  }

  winner.capital -= amount;
  const seller = getPlayer(newState, auction.sellerId);
  if (seller) {
    seller.capital += amount;
  }

  newState = transferTileToWinner(newState, auction, winnerId, {
    removeFromSellerId: auction.sellerId,
    clearMortgage: true,
  });
  applyAuctionResumePhase(newState, auction.resumePhase);
  logAuctionSettled(logs, auction, winnerId, amount);
  applyWinIfThresholdCrossed(newState, logs);
  return { state: newState, logEntries: logs };
}

function settleSellerBackedAuctionWinner(
  state: InternalGameState,
  auction: PendingAuctionState,
  winnerId: string,
  amount: number,
  logs: LogEntry[],
): ApplyActionResult {
  return settlePlayerInitiatedAuctionWinner(
    state,
    auction,
    winnerId,
    amount,
    logs,
  );
}

function settleForeclosureAuctionWinner(
  state: InternalGameState,
  auction: PendingAuctionState,
  winnerId: string,
  amount: number,
  logs: LogEntry[],
): ApplyActionResult {
  if (!state.pendingForeclosure) {
    throw "game.invalid_action";
  }

  let newState = clearPendingAuction(state);
  const winner = getPlayer(newState, winnerId);
  if (!winner || winner.capital < amount) {
    throw winner ? "game.insufficient_capital" : "game.invalid_player_state";
  }

  winner.capital -= amount;
  removeForeclosedTileFromDebtor(newState, auction);
  newState = transferTileToWinner(newState, auction, winnerId, {
    clearMortgage: true,
  });

  const workingState = applyForeclosureAuctionProceeds(newState, amount, logs);
  logAuctionSettled(logs, auction, winnerId, amount);
  applyWinIfThresholdCrossed(workingState, logs);
  return { state: workingState, logEntries: logs };
}

export function finishAuctionWithoutSale(
  state: InternalGameState,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (!auction) {
    throw "game.auction_not_active";
  }

  const tile = getTileByPosition(auction.tilePosition);
  logs.push({
    playerId: null,
    actionType: "auction_no_bids",
    payload: {
      position: auction.tilePosition,
      name: tile?.name ?? "Unknown",
      trigger: auction.trigger,
    },
  });

  switch (auction.trigger) {
    case "foreclosure":
      return settleForeclosureAuctionWithoutSale(state, logs);
    case "decline":
      return settleDeclineAuctionWithoutSale(state, auction, logs);
    case "forced_sale":
    case "player_initiated":
      return settleDeclineAuctionWithoutSale(state, auction, logs);
  }
}

export function awardTileToWinner(
  state: InternalGameState,
  winnerId: string,
  amount: number,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (!auction) {
    throw "game.auction_not_active";
  }

  const tile = getTileByPosition(auction.tilePosition);
  if (!tile) {
    throw "game.tile_not_purchasable";
  }

  switch (auction.trigger) {
    case "foreclosure":
      return settleForeclosureAuctionWinner(
        state,
        auction,
        winnerId,
        amount,
        logs,
      );
    case "player_initiated":
      return settlePlayerInitiatedAuctionWinner(
        state,
        auction,
        winnerId,
        amount,
        logs,
      );
    case "forced_sale":
      return settleSellerBackedAuctionWinner(
        state,
        auction,
        winnerId,
        amount,
        logs,
      );
    case "decline":
      return settleDeclineAuctionWinner(state, auction, winnerId, amount, logs);
  }
}
