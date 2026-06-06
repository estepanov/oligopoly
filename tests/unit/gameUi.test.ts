import type { GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import {
  mergeAuctionClientView,
  phaseUiDescriptor,
  turnGuidance,
} from "../../packages/web/src/lib/gameUi";

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

describe("turnGuidance", () => {
  const stateAt = (phase: GameState["phase"]): GameState => ({
    gameId: "g",
    round: 1,
    phase,
    currentPlayerIndex: 0,
    turnOrder: ["me", "you"],
  });

  it("prompts to roll again after doubles", () => {
    expect(turnGuidance(stateAt("rolling_doubles"), "me")).toMatch(
      /roll again/i,
    );
  });

  it("prompts to draw, roll, buy, and act in the right phases", () => {
    expect(turnGuidance(stateAt("waiting_for_market_event"), "me")).toMatch(
      /draw/i,
    );
    expect(turnGuidance(stateAt("waiting_for_roll"), "me")).toMatch(/roll/i);
    expect(turnGuidance(stateAt("waiting_for_buy"), "me")).toMatch(/buy/i);
    expect(turnGuidance(stateAt("action"), "me")).toMatch(/end your turn/i);
  });

  it("returns null when it is not the player's turn", () => {
    expect(turnGuidance(stateAt("waiting_for_roll"), "you")).toBeNull();
  });
});

describe("phaseUiDescriptor", () => {
  it("centralizes basic phase-level turn capabilities", () => {
    expect(phaseUiDescriptor("waiting_for_market_event")).toMatchObject({
      canDrawMarketEvent: true,
    });
    expect(phaseUiDescriptor("waiting_for_roll")).toMatchObject({
      canRollDice: true,
    });
    expect(phaseUiDescriptor("rolling_doubles")).toMatchObject({
      canRollDice: true,
    });
    expect(phaseUiDescriptor("waiting_for_buy")).toMatchObject({
      canResolvePurchase: true,
    });
    expect(phaseUiDescriptor("waiting_for_path_choice")).toMatchObject({
      canChoosePath: true,
    });
    expect(phaseUiDescriptor("action")).toMatchObject({
      canEndTurn: true,
    });
  });
});
