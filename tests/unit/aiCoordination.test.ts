import {
  chooseAiAction,
  findNextAiCoordinationActor,
  normalizeGameState,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("AI syndicate coordination", () => {
  const state = normalizeGameState({
    gameId: "g-ai-coord",
    round: 2,
    phase: "syndicate_coordination",
    currentPlayerIndex: 0,
    turnOrder: ["ai:p1", "user-2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [
      {
        playerId: "ai:p1",
        kind: "ai",
        position: 0,
        capital: 1000,
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
        playerId: "user-2",
        position: 0,
        capital: 1000,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 0,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
        coordinationAcknowledged: true,
      },
    ],
    tiles: [],
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    aiPlayers: [
      {
        playerId: "ai:p1",
        name: "Bot",
        personality: "opportunist",
      },
    ],
    settings: {},
  });

  it("finds AI players that have not acknowledged coordination", () => {
    expect(findNextAiCoordinationActor(state)).toBe("ai:p1");
  });

  it("chooses end_coordination during syndicate_coordination", () => {
    const decision = chooseAiAction(state);
    expect(decision?.action.type).toBe("end_coordination");
    expect(decision?.actorId).toBe("ai:p1");
  });
});
