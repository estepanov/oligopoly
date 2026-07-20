import type { GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import {
  describeGameStep,
  gameActionAvailability,
  turnGuidance,
} from "./gameStepUi";
import { viewerHasUrgentObligation } from "./gameUi";

function baseGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "game-1",
    stateVersion: 0,
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["me", "opponent"],
    freeMarketPool: 0,
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    myAffinityCardId: null,
    players: [
      {
        playerId: "me",
        displayName: "Ada",
        position: 0,
        capital: 500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
      {
        playerId: "opponent",
        displayName: "Grace",
        position: 1,
        capital: 500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 0,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    tiles: [],
    ...overrides,
  };
}

function auctionState(overrides: Partial<GameState> = {}): GameState {
  return baseGameState({
    phase: "waiting_for_auction_bids",
    currentPlayerIndex: 1,
    pendingAuction: {
      tilePosition: 6,
      trigger: "decline",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds: ["me", "opponent"],
      resumePhase: "action",
      submissionCount: 0,
    },
    ...overrides,
  });
}

describe("game UI descriptors", () => {
  it("keeps turn copy separate from action availability", () => {
    const descriptor = describeGameStep(baseGameState(), "me");

    expect(descriptor.guidance).toBe("Roll the dice to move.");
    expect(descriptor.eyebrow).toBe("Movement");
    expect(descriptor.title).toBe("Roll to move");
    expect(turnGuidance(baseGameState(), "me")).toBe(descriptor.guidance);
    expect(gameActionAvailability(baseGameState(), "me")).toEqual({
      canRollDice: true,
    });
  });

  it("derives button gates from phase and turn predicates", () => {
    expect(
      gameActionAvailability(
        baseGameState({
          phase: "waiting_for_buy",
          pendingBuyTilePosition: 6,
        }),
        "me",
      ),
    ).toEqual({ canResolvePurchase: true });
    expect(
      gameActionAvailability(baseGameState({ phase: "action" }), "me"),
    ).toEqual({ canEndTurn: true });
    expect(gameActionAvailability(baseGameState(), "opponent")).toEqual({});
  });

  it("does not tell ineligible auction viewers to bid", () => {
    const step = describeGameStep(
      auctionState({
        pendingAuction: {
          tilePosition: 6,
          trigger: "decline",
          auctionType: "sealed_bids",
          submissions: {},
          eligiblePlayerIds: ["opponent"],
          resumePhase: "action",
        },
      }),
      "me",
    );

    expect(step.title).toBe("Watch the auction");
    expect(step.description).toMatch(/not eligible/i);
  });

  it("distinguishes submitted sealed bids from open bidding prompts", () => {
    const step = describeGameStep(
      auctionState({
        pendingAuction: {
          tilePosition: 6,
          trigger: "decline",
          auctionType: "sealed_bids",
          submissions: {},
          eligiblePlayerIds: ["me", "opponent"],
          resumePhase: "action",
          mySubmission: 20,
        },
      }),
      "me",
    );

    expect(step.title).toBe("Bid submitted");
    expect(step.coaching).toMatch(/no further action/i);
  });

  it("keeps eligible live bidders active even after a prior bid", () => {
    const step = describeGameStep(
      auctionState({
        pendingAuction: {
          tilePosition: 6,
          trigger: "decline",
          auctionType: "live_bidding",
          submissions: { me: 25 },
          eligiblePlayerIds: ["me", "opponent"],
          resumePhase: "action",
        },
      }),
      "me",
    );

    expect(step.eyebrow).toBe("Live auction");
    expect(step.title).toBe("Raise your bid or hold");
  });
});

describe("viewerHasUrgentObligation", () => {
  const ownTurnState = {
    gameId: "g",
    stateVersion: 0,
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["me", "ai:bot"],
    players: [],
  } as GameState;

  it("is false on my own turn with no auction/trade owed", () => {
    // The headline fix: it's the viewer's own turn per canonical state, but
    // there is no auction bid or trade response owed, so presentation should
    // be free to keep draining queued AI beats rather than treating this as
    // an urgent interrupt.
    expect(viewerHasUrgentObligation(ownTurnState, "me")).toBe(false);
  });

  it("is false during game_over even when the viewer still owes an auction bid", () => {
    expect(
      viewerHasUrgentObligation(
        {
          gameId: "g",
          stateVersion: 0,
          round: 1,
          phase: "game_over",
          currentPlayerIndex: 0,
          turnOrder: ["me", "ai:bot"],
          players: [],
        } as GameState,
        "me",
      ),
    ).toBe(false);
  });

  it("is true for an owed auction bid even off my turn", () => {
    expect(
      viewerHasUrgentObligation(
        {
          gameId: "g",
          stateVersion: 0,
          round: 1,
          phase: "waiting_for_auction_bids",
          currentPlayerIndex: 1,
          turnOrder: ["me", "ai:bot"],
          players: [],
          pendingAuction: {
            tilePosition: 3,
            trigger: "player_initiated",
            auctionType: "sealed_bids",
            submissions: {},
            eligiblePlayerIds: ["me", "ai:bot"],
            resumePhase: "action",
          },
        } as GameState,
        "me",
      ),
    ).toBe(true);
  });

  it("is false when the viewer already submitted an auction bid", () => {
    expect(
      viewerHasUrgentObligation(
        {
          gameId: "g",
          stateVersion: 0,
          round: 1,
          phase: "waiting_for_auction_bids",
          currentPlayerIndex: 1,
          turnOrder: ["me", "ai:bot"],
          players: [],
          pendingAuction: {
            tilePosition: 3,
            trigger: "player_initiated",
            auctionType: "sealed_bids",
            submissions: {},
            eligiblePlayerIds: ["me", "ai:bot"],
            resumePhase: "action",
            mySubmission: 10,
          },
        } as GameState,
        "me",
      ),
    ).toBe(false);
  });

  it("is true for a pending inbound trade even off my turn", () => {
    expect(
      viewerHasUrgentObligation(
        {
          gameId: "g",
          stateVersion: 0,
          round: 1,
          phase: "action",
          currentPlayerIndex: 1,
          turnOrder: ["me", "ai:bot"],
          players: [],
          tradeOffers: [
            {
              id: "trade-1",
              gameId: "g",
              proposerId: "ai:bot",
              recipientId: "me",
              gives: { capital: 0, tilePositions: [] },
              receives: { capital: 0, tilePositions: [] },
              status: "pending",
              createdAt: 1,
              expiresAt: 2,
              counterCount: 0,
            },
          ],
        } as GameState,
        "me",
      ),
    ).toBe(true);
  });

  it("is false when the viewer's trade offer is not pending", () => {
    expect(
      viewerHasUrgentObligation(
        {
          gameId: "g",
          stateVersion: 0,
          round: 1,
          phase: "action",
          currentPlayerIndex: 1,
          turnOrder: ["me", "ai:bot"],
          players: [],
          tradeOffers: [
            {
              id: "trade-1",
              gameId: "g",
              proposerId: "ai:bot",
              recipientId: "me",
              gives: { capital: 0, tilePositions: [] },
              receives: { capital: 0, tilePositions: [] },
              status: "accepted",
              createdAt: 1,
              expiresAt: 2,
              counterCount: 0,
            },
          ],
        } as GameState,
        "me",
      ),
    ).toBe(false);
  });

  it("is false without a viewer id", () => {
    expect(viewerHasUrgentObligation(ownTurnState, null)).toBe(false);
  });
});
