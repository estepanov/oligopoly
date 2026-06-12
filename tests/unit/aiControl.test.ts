import {
  applyTimeoutTakeover,
  chooseAiAction,
  initTileStates,
  isAiControlledActor,
  normalizeGameState,
  replaceKickedPlayerWithAi,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

const baseState = () =>
  normalizeGameState({
    gameId: "g1",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["human-a", "ai:bot"],
    freeMarketPool: 0,
    affinityAssignments: {},
    aiPlayers: [
      { playerId: "ai:bot", name: "Bot", personality: "opportunist" },
    ],
    players: [
      {
        playerId: "human-a",
        kind: "human",
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
        playerId: "ai:bot",
        kind: "ai",
        aiPersonality: "opportunist",
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

describe("aiControl", () => {
  it("detects native AI seats", () => {
    const state = baseState();
    expect(isAiControlledActor(state, "ai:bot")).toBe(true);
    expect(isAiControlledActor(state, "human-a")).toBe(false);
  });

  it("detects temporary timeout takeover seats", () => {
    const state = applyTimeoutTakeover(baseState(), "human-a");
    expect(isAiControlledActor(state, "human-a")).toBe(true);
    expect(state.aiPlayers?.[1]?.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(state.aiPlayers?.[1]?.name).not.toBe("Auto");
    const decision = chooseAiAction({
      ...state,
      currentPlayerIndex: 0,
    });
    expect(decision?.actorId).toBe("human-a");
    expect(decision?.action.type).toBe("roll_dice");
  });

  it("always proposes valid 1..6 dice for AI rolls across many seeds", () => {
    // Regression: a signed right-shift in the deterministic dice helper could
    // produce a negative second die (e.g. -4) for large hash seeds, leading to
    // negative board positions during AI / timeout-takeover rolls.
    for (let i = 0; i < 500; i++) {
      const state = {
        ...baseState(),
        gameId: `seed-${i}-xyzzy`,
        round: (i % 13) + 1,
        currentPlayerIndex: 1, // ai:bot is the actor
        lastDiceRoll: i % 2 === 0 ? null : ([i % 6, (i + 2) % 6] as const),
      };
      const decision = chooseAiAction(state as ReturnType<typeof baseState>);
      expect(decision?.action.type).toBe("roll_dice");
      const result = (decision?.action as { result?: [number, number] }).result;
      expect(result).toBeDefined();
      for (const die of result as [number, number]) {
        expect(Number.isInteger(die)).toBe(true);
        expect(die).toBeGreaterThanOrEqual(1);
        expect(die).toBeLessThanOrEqual(6);
      }
    }
  });

  // TC-7: AI counters a below-margin but counterable offer, and rejects once
  // the counter limit is reached.
  const tradeResponseState = (counterCount: number) =>
    normalizeGameState({
      gameId: "g-trade",
      round: 1,
      phase: "action",
      currentPlayerIndex: 0,
      turnOrder: ["human-a", "ai:bot"],
      freeMarketPool: 0,
      affinityAssignments: {},
      aiPlayers: [
        { playerId: "ai:bot", name: "Bot", personality: "opportunist" },
      ],
      players: [
        {
          playerId: "human-a",
          kind: "human",
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
        {
          playerId: "ai:bot",
          kind: "ai",
          aiPersonality: "opportunist",
          position: 0,
          capital: 1500,
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
      tiles: initTileStates().map((tile) =>
        String(tile.position) === "6" ? { ...tile, ownerId: "ai:bot" } : tile,
      ),
      pendingBuyTilePosition: null,
      lastDiceRoll: null,
      winnerId: null,
      eliminatedPlayerIds: [],
      tradeOffers: [
        {
          id: "trade-g-trade-1",
          gameId: "g-trade",
          proposerId: "human-a",
          recipientId: "ai:bot",
          // AI is asked to give up tile 6 (cost 140) for only 50 capital.
          gives: { capital: 50, tilePositions: [] },
          receives: { capital: 0, tilePositions: [6] },
          status: "pending",
          createdAt: Date.now(),
          expiresAt: Date.now() + 300_000,
          counterCount,
        },
      ],
      settings: {},
    });

  it("counters a below-margin offer that is still counterable", () => {
    const decision = chooseAiAction(tradeResponseState(0));
    expect(decision?.actorId).toBe("ai:bot");
    expect(decision?.action.type).toBe("counter_trade");
    const action = decision?.action as {
      type: string;
      receives: { capital: number };
    };
    // The AI asks the proposer to make up the tile-value gap (140 - 50 = 90).
    expect(action.receives.capital).toBe(140);
  });

  it("rejects a below-margin offer once the counter limit is reached", () => {
    const decision = chooseAiAction(tradeResponseState(2));
    expect(decision?.actorId).toBe("ai:bot");
    expect(decision?.action.type).toBe("reject_trade");
  });

  it("replaces kicked humans with permanent AI control", () => {
    const state = replaceKickedPlayerWithAi(baseState(), "human-a");
    expect(state.kickedPlayerIds).toEqual(["human-a"]);
    expect(state.players[0]?.kind).toBe("ai");
    expect(state.players[0]?.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(state.players[0]?.displayName).not.toBe("AI replacement");
    expect(state.aiPlayers?.find((ai) => ai.playerId === "human-a")?.name).toBe(
      state.players[0]?.displayName,
    );
    expect(isAiControlledActor(state, "human-a")).toBe(true);
  });
});
