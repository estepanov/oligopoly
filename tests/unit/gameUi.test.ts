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
  it("preserves viewer-private fields when public realtime updates omit them", () => {
    const previous: GameState = {
      gameId: "game-1",
      round: 1,
      phase: "waiting_for_insider_peek",
      myAffinityCardId: "ai_pioneer",
      pendingInsiderPeek: {
        cardId: "market_crash",
        drawingPlayerId: "p1",
        trigger: "round_start",
      },
      handshakeAgreements: [
        {
          id: "handshake-1",
          partyA: "p1",
          partyB: "p2",
          summary: "private",
          status: "pending",
          createdRound: 1,
        },
      ],
      negotiationThreads: [
        {
          id: "thread-1",
          createdBy: "p1",
          partyIds: ["p1", "p2"],
          status: "open",
          startedRound: 1,
          expiresAfterRound: 4,
          visibility: "private",
        },
      ],
    };

    const incoming: GameState = {
      gameId: "game-1",
      round: 1,
      phase: "waiting_for_insider_peek",
      negotiationThreads: [
        {
          id: "open-thread",
          createdBy: "p2",
          partyIds: ["p2", "p3"],
          status: "open",
          startedRound: 1,
          expiresAfterRound: 4,
          visibility: "open",
        },
      ],
    };

    const merged = mergeAuctionClientView(previous, incoming);
    expect(merged.myAffinityCardId).toBe("ai_pioneer");
    expect(merged.pendingInsiderPeek?.cardId).toBe("market_crash");
    expect(merged.handshakeAgreements?.map((entry) => entry.id)).toEqual([
      "handshake-1",
    ]);
    expect(merged.negotiationThreads?.map((entry) => entry.id)).toEqual([
      "open-thread",
      "thread-1",
    ]);
  });
});
