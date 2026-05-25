import { getTileByPosition } from "../config/board.js";
import {
  computeAuctionBidDeadline,
  isAuctionBidWindowOpen,
} from "./auctionTiming.js";
import { rollFairD6 } from "./dice.js";
import type {
  ApplyActionResult,
  InternalGameState,
  InternalPlayerState,
  LogEntry,
} from "./gameStateMachine.js";

export type PendingAuctionState = {
  tilePosition: number | string;
  trigger: "decline";
  auctionType: "sealed_bids";
  submissions: Record<string, number | "pass">;
  eligiblePlayerIds: string[];
  tieBreakMinBid?: number;
  tieBreakRound: number;
  resumePhase: "action" | "rolling_doubles";
  bidDeadlineAt: number;
};

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function getPlayer(
  state: InternalGameState,
  playerId: string,
): InternalPlayerState | undefined {
  return state.players.find((player) => player.playerId === playerId);
}

function auctionBidDeadline(state: InternalGameState, nowMs: number): number {
  return computeAuctionBidDeadline(nowMs, state.settings);
}

export function getActiveEligibleBidders(state: InternalGameState): string[] {
  const auction = state.pendingAuction;
  if (!auction) return [];
  return auction.eligiblePlayerIds.filter(
    (playerId) => !state.eliminatedPlayerIds.includes(playerId),
  );
}

export function hasAuctionSubmission(
  auction: PendingAuctionState,
  playerId: string,
): boolean {
  return Object.hasOwn(auction.submissions, playerId);
}

export function allEligiblePlayersSubmitted(state: InternalGameState): boolean {
  const auction = state.pendingAuction;
  if (!auction) return false;
  return getActiveEligibleBidders(state).every((playerId) =>
    hasAuctionSubmission(auction, playerId),
  );
}

export function startDeclineAuction(
  state: InternalGameState,
  tilePosition: number | string,
  resumePhase: "action" | "rolling_doubles",
  nowMs: number = Date.now(),
): InternalGameState {
  const eligiblePlayerIds = state.turnOrder.filter(
    (playerId) => !state.eliminatedPlayerIds.includes(playerId),
  );

  return {
    ...deepClone(state),
    pendingBuyTilePosition: null,
    phase: "waiting_for_auction_bids",
    pendingAuction: {
      tilePosition,
      trigger: "decline",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds,
      tieBreakRound: 0,
      resumePhase,
      bidDeadlineAt: auctionBidDeadline(state, nowMs),
    },
  };
}

function finishAuctionWithoutSale(
  state: InternalGameState,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction!;
  const tile = getTileByPosition(auction.tilePosition);

  const newState = deepClone(state);
  newState.pendingAuction = undefined;
  newState.phase = auction.resumePhase;

  logs.push({
    playerId: null,
    actionType: "auction_no_bids",
    payload: {
      position: auction.tilePosition,
      name: tile?.name ?? "Unknown",
    },
  });

  return { state: newState, logEntries: logs };
}

function awardTileToWinner(
  state: InternalGameState,
  winnerId: string,
  amount: number,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction!;
  const tile = getTileByPosition(auction.tilePosition);
  if (!tile) {
    throw "game.tile_not_purchasable";
  }

  const newState = deepClone(state);
  const winner = getPlayer(newState, winnerId);
  if (!winner) {
    throw "game.invalid_player_state";
  }
  if (winner.capital < amount) {
    throw "game.insufficient_capital";
  }

  winner.capital -= amount;
  winner.ownedTilePositions.push(auction.tilePosition);

  const tileState = newState.tiles.find(
    (entry) => String(entry.position) === String(auction.tilePosition),
  );
  if (tileState) {
    tileState.ownerId = winnerId;
  }

  newState.pendingAuction = undefined;
  newState.phase = auction.resumePhase;

  logs.push({
    playerId: winnerId,
    actionType: "auction_settled",
    payload: {
      position: auction.tilePosition,
      name: tile.name,
      amount,
      winnerId,
      submissions: auction.submissions,
    },
  });

  return { state: newState, logEntries: logs };
}

function startTieBreakRound(
  state: InternalGameState,
  topBidders: string[],
  maxAmount: number,
  nowMs: number,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction!;
  const newState = deepClone(state);
  newState.pendingAuction = {
    ...auction,
    submissions: {},
    eligiblePlayerIds: topBidders,
    tieBreakMinBid: maxAmount,
    tieBreakRound: auction.tieBreakRound + 1,
    bidDeadlineAt: auctionBidDeadline(state, nowMs),
  };
  logs.push({
    playerId: null,
    actionType: "auction_tie_break",
    payload: {
      position: auction.tilePosition,
      amount: maxAmount,
      playerIds: topBidders,
      round: newState.pendingAuction.tieBreakRound,
    },
  });
  return { state: newState, logEntries: logs };
}

export function settleSealedAuction(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (!auction || state.phase !== "waiting_for_auction_bids") {
    throw "game.auction_not_active";
  }

  const logs: LogEntry[] = [];
  const bids = Object.entries(auction.submissions).flatMap(
    ([playerId, value]) =>
      typeof value === "number" && value >= 1
        ? [[playerId, value] as const]
        : [],
  );

  if (bids.length === 0) {
    return finishAuctionWithoutSale(state, logs);
  }

  const minBid = auction.tieBreakMinBid ?? 1;
  const validBids = bids.filter(([, amount]) => amount >= minBid);
  if (validBids.length === 0) {
    return finishAuctionWithoutSale(state, logs);
  }

  const maxAmount = Math.max(...validBids.map(([, amount]) => amount));
  const topBidders = validBids
    .filter(([, amount]) => amount === maxAmount)
    .map(([playerId]) => playerId);

  if (topBidders.length > 1) {
    return startTieBreakRound(state, topBidders, maxAmount, nowMs, logs);
  }

  return awardTileToWinner(state, topBidders[0], maxAmount, logs);
}

function passForMissingBidders(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  const auction = state.pendingAuction;
  if (!auction) return state;

  const newState = deepClone(state);
  const tile = getTileByPosition(auction.tilePosition);
  const pendingAuction = { ...newState.pendingAuction! };

  for (const playerId of getActiveEligibleBidders(newState)) {
    if (hasAuctionSubmission(pendingAuction, playerId)) continue;
    pendingAuction.submissions[playerId] = "pass";
    logs.push({
      playerId,
      actionType: "auction_pass",
      payload: {
        position: auction.tilePosition,
        name: tile?.name ?? "Unknown",
        reason: "timeout",
      },
    });
  }

  newState.pendingAuction = pendingAuction;
  return newState;
}

/**
 * Close the sealed bid window when the deadline passes or all players submitted.
 * Returns null when the auction should remain open.
 */
export function closeAuctionBidWindowIfReady(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult | null {
  const auction = state.pendingAuction;
  if (!auction || state.phase !== "waiting_for_auction_bids") {
    return null;
  }

  const allSubmitted = allEligiblePlayersSubmitted(state);
  const windowOpen = isAuctionBidWindowOpen(auction.bidDeadlineAt, nowMs);
  if (windowOpen && !allSubmitted) {
    return null;
  }

  const logs: LogEntry[] = [];
  let workingState = state;
  if (!allSubmitted) {
    workingState = passForMissingBidders(workingState, logs);
  }

  const settled = settleSealedAuction(workingState, nowMs);
  return {
    state: settled.state,
    logEntries: [...logs, ...settled.logEntries],
  };
}

export function recordAuctionSubmission(
  state: InternalGameState,
  playerId: string,
  submission: number | "pass",
  nowMs: number = Date.now(),
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (!auction || state.phase !== "waiting_for_auction_bids") {
    throw "game.auction_not_active";
  }
  if (!isAuctionBidWindowOpen(auction.bidDeadlineAt, nowMs)) {
    throw "game.auction_closed";
  }

  if (!getActiveEligibleBidders(state).includes(playerId)) {
    throw "game.not_auction_eligible";
  }
  if (hasAuctionSubmission(auction, playerId)) {
    throw "game.auction_already_submitted";
  }

  if (submission !== "pass") {
    const minBid = auction.tieBreakMinBid ?? 1;
    if (submission < minBid) {
      throw "game.auction_bid_too_low";
    }
    const player = getPlayer(state, playerId);
    if (!player || player.capital < submission) {
      throw "game.insufficient_capital";
    }
  }

  const tile = getTileByPosition(auction.tilePosition);
  const logs: LogEntry[] = [
    {
      playerId,
      actionType: submission === "pass" ? "auction_pass" : "auction_bid",
      payload: {
        position: auction.tilePosition,
        name: tile?.name ?? "Unknown",
      },
    },
  ];

  const newState = deepClone(state);
  newState.pendingAuction = {
    ...auction,
    submissions: {
      ...auction.submissions,
      [playerId]: submission,
    },
  };

  const closed = closeAuctionBidWindowIfReady(newState, nowMs);
  if (closed) {
    return {
      state: closed.state,
      logEntries: [...logs, ...closed.logEntries],
    };
  }

  return { state: newState, logEntries: logs };
}

export function suggestAiAuctionBid(
  state: InternalGameState,
  playerId: string,
): number | "pass" {
  const auction = state.pendingAuction;
  if (!auction) return "pass";

  const player = getPlayer(state, playerId);
  const tile = getTileByPosition(auction.tilePosition);
  if (!player || !tile?.cost) return "pass";

  const minBid = auction.tieBreakMinBid ?? 1;
  const reserve = 150;
  const target = Math.max(minBid, Math.floor(tile.cost * 0.85));

  if (player.capital - target < reserve) {
    return "pass";
  }

  const jitter = rollFairD6();
  return Math.min(player.capital - reserve, target + jitter);
}
