import { getTileByPosition } from "../config/board.js";
import {
  startDeclineAuction,
  startForeclosureAuction,
} from "./auctionLifecycle.js";
import {
  isLiveAuction,
  isSealedAuction,
  isVisibleAuction,
  settlesImmediatelyAfterBidWindow,
} from "./auctionMode.js";
import {
  awardTileToWinner,
  finishAuctionWithoutSale,
} from "./auctionSettlement.js";
import {
  computeAuctionBidDeadline,
  computeAuctionSettleDeadline,
  computeLiveAuctionExtensionDeadline,
  isAuctionBidWindowOpen,
  isAuctionSettleDelayActive,
} from "./auctionTiming.js";
import type { PendingAuctionState } from "./auctionTypes.js";

export type {
  AuctionResumePhase,
  AuctionTrigger,
  PendingAuctionState,
} from "./auctionTypes.js";

import { rollFairD6 } from "./dice.js";
import type {
  ApplyActionResult,
  InternalGameState,
  LogEntry,
} from "./gameStateTypes.js";
import { deepClone, getPlayer } from "./stateUtils.js";

export {
  startDeclineAuction,
  startForeclosureAuction,
} from "./auctionLifecycle.js";
export type { DeclineAuctionType } from "./auctionMode.js";

export { isSealedAuction, resolveDeclineAuctionType } from "./auctionMode.js";

function auctionBidDeadline(state: InternalGameState, nowMs: number): number {
  return computeAuctionBidDeadline(nowMs, state.settings);
}

export function currentAuctionHighBid(auction: PendingAuctionState): number {
  const floor = (auction.tieBreakMinBid ?? 1) - 1;
  let high = floor;
  for (const value of Object.values(auction.submissions)) {
    if (typeof value === "number" && value > high) {
      high = value;
    }
  }
  return high;
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

function startTieBreakRound(
  state: InternalGameState,
  topBidders: string[],
  maxAmount: number,
  nowMs: number,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction!;
  const newState = deepClone(state);
  newState.phase = "waiting_for_auction_bids";
  newState.pendingAuction = {
    ...auction,
    submissions: {},
    eligiblePlayerIds: topBidders,
    tieBreakMinBid: maxAmount,
    tieBreakRound: auction.tieBreakRound + 1,
    bidDeadlineAt: auctionBidDeadline(state, nowMs),
    settleDeadlineAt: undefined,
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

function resolveVisibleAuctionTieWithDice(
  state: InternalGameState,
  topBidders: string[],
  amount: number,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction!;
  const rolls = topBidders.map((playerId) => ({
    playerId,
    roll: rollFairD6() + rollFairD6(),
  }));
  const maxRoll = Math.max(...rolls.map((entry) => entry.roll));
  const winners = rolls
    .filter((entry) => entry.roll === maxRoll)
    .map((entry) => entry.playerId);

  logs.push({
    playerId: null,
    actionType: "auction_tie_break",
    payload: {
      position: auction.tilePosition,
      amount,
      playerIds: topBidders,
      method: "dice",
      rolls: Object.fromEntries(
        rolls.map((entry) => [entry.playerId, entry.roll]),
      ),
    },
  });

  if (winners.length > 1) {
    return resolveVisibleAuctionTieWithDice(state, winners, amount, logs);
  }

  return awardTileToWinner(state, winners[0], amount, logs);
}

export function settlePendingAuction(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (
    !auction ||
    (state.phase !== "waiting_for_auction_settle" &&
      state.phase !== "waiting_for_auction_bids")
  ) {
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
    if (!isSealedAuction(auction)) {
      return resolveVisibleAuctionTieWithDice(
        state,
        topBidders,
        maxAmount,
        logs,
      );
    }
    return startTieBreakRound(state, topBidders, maxAmount, nowMs, logs);
  }

  return awardTileToWinner(state, topBidders[0], maxAmount, logs);
}

/** @deprecated Use settlePendingAuction */
export const settleSealedAuction = settlePendingAuction;

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

function beginAuctionSettlePhase(
  state: InternalGameState,
  nowMs: number,
  logs: LogEntry[],
): ApplyActionResult {
  const auction = state.pendingAuction;
  if (!auction) {
    throw "game.auction_not_active";
  }

  const tile = getTileByPosition(auction.tilePosition);
  const newState = deepClone(state);
  newState.phase = "waiting_for_auction_settle";
  newState.pendingAuction = {
    ...auction,
    settleDeadlineAt: computeAuctionSettleDeadline(nowMs, state.settings),
  };

  logs.push({
    playerId: null,
    actionType: "auction_bids_closed",
    payload: {
      position: auction.tilePosition,
      name: tile?.name ?? "Unknown",
    },
  });

  return { state: newState, logEntries: logs };
}

/**
 * Close the bid window when the deadline passes or all players submitted.
 * Sealed auctions enter the settle delay; open auctions settle immediately.
 * Returns null when the auction should remain open for bids.
 */
export function closeAuctionBidWindowIfReady(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult | null {
  const auction = state.pendingAuction;
  if (!auction || state.phase !== "waiting_for_auction_bids") {
    return null;
  }

  const windowOpen = isAuctionBidWindowOpen(auction.bidDeadlineAt, nowMs);
  if (isLiveAuction(auction)) {
    if (windowOpen) return null;
    const settled = settlePendingAuction(state, nowMs);
    return settled;
  }

  const allSubmitted = allEligiblePlayersSubmitted(state);
  if (windowOpen && !allSubmitted) {
    return null;
  }

  const logs: LogEntry[] = [];
  let workingState = state;
  if (!allSubmitted) {
    workingState = passForMissingBidders(workingState, logs);
  }

  if (settlesImmediatelyAfterBidWindow(auction)) {
    const settled = settlePendingAuction(workingState, nowMs);
    return {
      state: settled.state,
      logEntries: [...logs, ...settled.logEntries],
    };
  }

  return beginAuctionSettlePhase(workingState, nowMs, logs);
}

/**
 * Reveal bids and settle after the configured settle delay.
 * Returns null while the settle countdown is still active.
 */
export function finalizeAuctionSettleIfReady(
  state: InternalGameState,
  nowMs: number = Date.now(),
): ApplyActionResult | null {
  const auction = state.pendingAuction;
  if (!auction || state.phase !== "waiting_for_auction_settle") {
    return null;
  }
  if (isAuctionSettleDelayActive(auction.settleDeadlineAt, nowMs)) {
    return null;
  }

  return settlePendingAuction(state, nowMs);
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
  if (isLiveAuction(auction)) {
    return recordLiveAuctionBid(state, playerId, submission, nowMs);
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
  const bidPayload: Record<string, unknown> = {
    position: auction.tilePosition,
    name: tile?.name ?? "Unknown",
  };
  if (submission !== "pass" && isVisibleAuction(auction)) {
    bidPayload.amount = submission;
  }

  const logs: LogEntry[] = [
    {
      playerId,
      actionType: submission === "pass" ? "auction_pass" : "auction_bid",
      payload: bidPayload,
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

function recordLiveAuctionBid(
  state: InternalGameState,
  playerId: string,
  submission: number | "pass",
  nowMs: number = Date.now(),
): ApplyActionResult {
  const auction = state.pendingAuction!;
  if (submission === "pass") {
    throw "game.invalid_action";
  }
  if (!isAuctionBidWindowOpen(auction.bidDeadlineAt, nowMs)) {
    throw "game.auction_closed";
  }
  if (!getActiveEligibleBidders(state).includes(playerId)) {
    throw "game.not_auction_eligible";
  }

  const minBid = Math.max(
    auction.tieBreakMinBid ?? 1,
    currentAuctionHighBid(auction) + 1,
  );
  if (submission < minBid) {
    throw "game.auction_bid_too_low";
  }

  const player = getPlayer(state, playerId);
  if (!player || player.capital < submission) {
    throw "game.insufficient_capital";
  }

  const previousHigh = currentAuctionHighBid(auction);
  const tile = getTileByPosition(auction.tilePosition);
  const logs: LogEntry[] = [
    {
      playerId,
      actionType: "auction_bid",
      payload: {
        position: auction.tilePosition,
        name: tile?.name ?? "Unknown",
        amount: submission,
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
    bidDeadlineAt:
      submission > previousHigh
        ? computeLiveAuctionExtensionDeadline(nowMs, state.settings)
        : auction.bidDeadlineAt,
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

  const minBid = isLiveAuction(auction)
    ? Math.max(auction.tieBreakMinBid ?? 1, currentAuctionHighBid(auction) + 1)
    : (auction.tieBreakMinBid ?? 1);
  const reserve = 150;
  const target = Math.max(minBid, Math.floor(tile.cost * 0.85));

  if (player.capital < minBid || player.capital - target < reserve) {
    return "pass";
  }

  const jitter = rollFairD6();
  return Math.max(minBid, Math.min(player.capital - reserve, target + jitter));
}
