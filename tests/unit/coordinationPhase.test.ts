import { applyAction, normalizeGameState } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("round boundary after full lap", () => {
  it("increments round and starts the next turn with turn-start market event", () => {
    const state = normalizeGameState({
      gameId: "g-coord",
      round: 1,
      phase: "action",
      currentPlayerIndex: 1,
      turnOrder: ["p1", "p2"],
      freeMarketPool: 0,
      affinityAssignments: {},
      players: [
        {
          playerId: "p1",
          position: 0,
          capital: 1500,
          ownedTilePositions: [],
          mortgagedTilePositions: [],
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
          capital: 1500,
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
      settings: {},
    });

    const result = applyAction(state, "p2", { type: "end_turn" });
    expect(result.state.round).toBe(2);
    expect(result.state.phase).toBe("waiting_for_roll");
  });
});
