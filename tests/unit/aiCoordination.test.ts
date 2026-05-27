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

  it("chooses a deterministic insider-peek action for AI players", () => {
    const insiderState = normalizeGameState({
      ...state,
      phase: "waiting_for_insider_peek",
      pendingInsiderPeek: {
        cardId: "market_crash",
        drawingPlayerId: "ai:p1",
        trigger: "round_start",
      },
    });

    const first = chooseAiAction(insiderState);
    const second = chooseAiAction(insiderState);

    expect(first?.actorId).toBe("ai:p1");
    expect(second).toEqual(first);
    expect([
      "insider_keep_market_event",
      "insider_discard_market_event",
    ]).toContain(first?.action.type);
  });
});
