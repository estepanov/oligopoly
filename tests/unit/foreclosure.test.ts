import type { InternalGameState } from "@oligopoly/shared";
import { normalizeGameState, settleRentPayment } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("foreclosure rent shortfall", () => {
  it("starts foreclosure when visitor cannot pay rent and has mortgaged tiles", () => {
    const state = normalizeGameState({
      gameId: "g-foreclosure",
      round: 1,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["p1", "p2"],
      freeMarketPool: 0,
      affinityAssignments: {},
      players: [
        {
          playerId: "p1",
          position: 8,
          capital: 10,
          ownedTilePositions: [8],
          mortgagedTilePositions: [8],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 0,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
        {
          playerId: "p2",
          position: 0,
          capital: 5000,
          ownedTilePositions: [8],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 2,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
      ],
      tiles: [
        { position: 8, ownerId: "p2", mortgaged: false, developmentTokens: 0 },
      ],
      pendingBuyTilePosition: null,
      lastDiceRoll: [3, 4],
      winnerId: null,
      eliminatedPlayerIds: [],
      settings: { optionalRuleIds: [] },
    }) as InternalGameState;

    const result = settleRentPayment(state, "p1", "p2", 500, 8);
    expect(result.shortfall).toBeGreaterThan(0);
    expect(
      result.state.pendingForeclosure?.debtorId === "p1" ||
        result.state.phase === "waiting_for_auction_bids",
    ).toBe(true);
  });
});
