import type { GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import { mergeAuctionClientView } from "../../packages/web/src/lib/gameUi";

function auctionState(
  pendingAuction: NonNullable<GameState["pendingAuction"]>,
): GameState {
  return {
    gameId: "game-1",
    round: 1,
    phase: "waiting_for_auction_bids",
    pendingAuction,
  };
}

describe("mergeAuctionClientView", () => {
  it("preserves mySubmission when broadcast snapshots omit it", () => {
    const previous = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 0,
      resumePhase: "action",
      submissionCount: 1,
      mySubmission: 90,
    });
    const incoming = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 0,
      resumePhase: "action",
      submissionCount: 2,
    });

    const merged = mergeAuctionClientView(previous, incoming);
    expect(merged.pendingAuction?.mySubmission).toBe(90);
    expect(merged.pendingAuction?.submissionCount).toBe(2);
  });

  it("does not preserve mySubmission after a tie-break reset", () => {
    const previous = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 0,
      resumePhase: "action",
      mySubmission: 75,
    });
    const incoming = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 1,
      resumePhase: "action",
      tieBreakMinBid: 75,
      submissionCount: 0,
    });

    const merged = mergeAuctionClientView(previous, incoming);
    expect(merged.pendingAuction?.mySubmission).toBeUndefined();
  });

  it("does not preserve mySubmission for open auctions", () => {
    const previous = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "open_bids",
      submissions: { p1: 90 },
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 0,
      resumePhase: "action",
      submissionCount: 1,
      mySubmission: 90,
    });
    const incoming = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "open_bids",
      submissions: { p1: 90, p2: 70 },
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 0,
      resumePhase: "action",
      submissionCount: 2,
    });

    expect(mergeAuctionClientView(previous, incoming)).toEqual(incoming);
  });

  it("does not preserve mySubmission for live auctions", () => {
    const previous = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "live_bidding",
      submissions: { p1: 90 },
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 0,
      resumePhase: "action",
      submissionCount: 1,
      mySubmission: 90,
    });
    const incoming = auctionState({
      tilePosition: 3,
      trigger: "decline",
      auctionType: "live_bidding",
      submissions: { p1: 90, p2: 100 },
      eligiblePlayerIds: ["p1", "p2"],
      tieBreakRound: 0,
      resumePhase: "action",
      submissionCount: 2,
    });

    expect(mergeAuctionClientView(previous, incoming)).toEqual(incoming);
  });
});
