import { resolveDeclineAuctionType } from "./auctionMode.js";
import { computeAuctionBidDeadline } from "./auctionTiming.js";
import type {
  AuctionResumePhase,
  PendingAuctionState,
} from "./auctionTypes.js";
import type { InternalGameState } from "./gameStateTypes.js";
import { deepClone } from "./stateUtils.js";

function auctionBidDeadline(state: InternalGameState, nowMs: number): number {
  return computeAuctionBidDeadline(nowMs, state.settings);
}

function createPendingAuction(
  state: InternalGameState,
  tilePosition: number | string,
  resumePhase: AuctionResumePhase,
  nowMs: number,
  overrides: Partial<PendingAuctionState>,
): InternalGameState {
  const eligiblePlayerIds = state.turnOrder.filter(
    (playerId) => !state.eliminatedPlayerIds.includes(playerId),
  );
  const auctionType = resolveDeclineAuctionType(state.settings);

  return {
    ...deepClone(state),
    pendingBuyTilePosition: null,
    phase: "waiting_for_auction_bids",
    pendingAuction: {
      tilePosition,
      trigger: "decline",
      auctionType,
      submissions: {},
      eligiblePlayerIds,
      tieBreakRound: 0,
      resumePhase,
      bidDeadlineAt: auctionBidDeadline(state, nowMs),
      ...overrides,
    },
  };
}

export function startDeclineAuction(
  state: InternalGameState,
  tilePosition: number | string,
  resumePhase: AuctionResumePhase,
  nowMs: number = Date.now(),
  overrides: Partial<
    Pick<
      PendingAuctionState,
      "sellerId" | "reservePrice" | "tieBreakMinBid" | "eligiblePlayerIds"
    >
  > = {},
): InternalGameState {
  return createPendingAuction(state, tilePosition, resumePhase, nowMs, {
    trigger: "decline",
    ...overrides,
  });
}

export function startForeclosureAuction(
  state: InternalGameState,
  tilePosition: number | string,
  resumePhase: AuctionResumePhase,
  nowMs: number = Date.now(),
): InternalGameState {
  return createPendingAuction(state, tilePosition, resumePhase, nowMs, {
    trigger: "foreclosure",
    tieBreakMinBid: 1,
  });
}
