import {
  normalizeGameState,
  recordOpposingSectorLanding,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("rateCards", () => {
  it("resets pressure timer only for opposing landings", () => {
    const state = normalizeGameState({
      gameId: "g-rate",
      round: 2,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["p1", "p2", "p3"],
      freeMarketPool: 0,
      affinityAssignments: {},
      players: [
        {
          playerId: "p1",
          position: 0,
          capital: 1000,
          ownedTilePositions: [],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 2,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
          syndicateId: "s1",
        },
        {
          playerId: "p2",
          position: 0,
          capital: 1000,
          ownedTilePositions: [],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 2,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
          syndicateId: "s1",
        },
        {
          playerId: "p3",
          position: 0,
          capital: 1000,
          ownedTilePositions: [],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 2,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
      ],
      tiles: [],
      pendingBuyTilePosition: null,
      lastDiceRoll: null,
      winnerId: null,
      eliminatedPlayerIds: [],
      syndicates: {
        s1: { syndicateId: "s1", adminId: "p1", memberIds: ["p1", "p2"] },
      },
      rateCards: [
        {
          sectorId: "emerging_tech",
          syndicateId: "s1",
          multiplier: 1.5,
          roundsWithoutOpposingLanding: 2,
        },
      ],
      settings: {},
    });

    const afterMember = recordOpposingSectorLanding(
      state,
      "p1",
      "emerging_tech",
    );
    expect(afterMember.rateCards?.[0].roundsWithoutOpposingLanding).toBe(2);

    const afterOpponent = recordOpposingSectorLanding(
      state,
      "p3",
      "emerging_tech",
    );
    expect(afterOpponent.rateCards?.[0].roundsWithoutOpposingLanding).toBe(0);
  });
});
