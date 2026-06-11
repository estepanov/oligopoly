import {
  applyAction,
  initTileStates,
  normalizeGameState,
  recordOpposingSectorLanding,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function qualifiedEmergingTechRateCardState() {
  return normalizeGameState({
    gameId: "g-rate-qualified",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [
      {
        playerId: "p1",
        position: 0,
        capital: 1000,
        ownedTilePositions: [1, 3, 5, 11],
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
        capital: 900,
        ownedTilePositions: [6],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    tiles: initTileStates().map((tile) => {
      if (["1", "3", "5", "11"].includes(String(tile.position))) {
        return { ...tile, ownerId: "p1" };
      }
      if (String(tile.position) === "6") return { ...tile, ownerId: "p2" };
      return tile;
    }),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    syndicates: {
      s1: { syndicateId: "s1", adminId: "p1", memberIds: ["p1"] },
    },
    rateCards: [
      {
        sectorId: "emerging_tech",
        syndicateId: "s1",
        multiplier: 1.5,
        roundsWithoutLanding: 0,
      },
    ],
    settings: {},
  });
}

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
          roundsWithoutLanding: 2,
        },
      ],
      settings: {},
    });

    const afterMember = recordOpposingSectorLanding(
      state,
      "p1",
      "emerging_tech",
    );
    expect(afterMember.rateCards?.[0].roundsWithoutLanding).toBe(2);

    const afterOpponent = recordOpposingSectorLanding(
      state,
      "p3",
      "emerging_tech",
    );
    expect(afterOpponent.rateCards?.[0].roundsWithoutLanding).toBe(0);
  });

  it("revokes an unqualified rate card after a qualifying tile is mortgaged", () => {
    const result = applyAction(qualifiedEmergingTechRateCardState(), "p1", {
      type: "mortgage_tile",
      tilePosition: 1,
    });

    expect(result.state.rateCards).toEqual([]);
    expect(
      result.logEntries.find(
        (entry) => entry.actionType === "rate_card_revoked",
      )?.payload,
    ).toEqual({ cause: { type: "mortgage", position: 1 } });
  });

  it("revokes an unqualified rate card after an accepted trade transfers control", () => {
    const proposed = applyAction(qualifiedEmergingTechRateCardState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 0, tilePositions: [1] },
      receives: { capital: 10, tilePositions: [] },
    });

    const accepted = applyAction(proposed.state, "p2", {
      type: "accept_trade",
      offerId: "trade-g-rate-qualified-1",
    });

    expect(accepted.state.rateCards).toEqual([]);
    expect(
      accepted.logEntries.find(
        (entry) => entry.actionType === "rate_card_revoked",
      )?.payload,
    ).toEqual({ cause: { type: "trade" } });
  });
});
