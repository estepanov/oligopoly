import {
  applyTimeoutTakeover,
  classifyAiPresentationBeat,
  isAiSeatForPresentation,
  normalizeGameState,
  replaceKickedPlayerWithAi,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function baseState() {
  return normalizeGameState({
    gameId: "g1",
    round: 1,
    phase: "action",
    currentPlayerIndex: 1,
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
        position: 5,
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
    tiles: [
      {
        position: 1,
        ownerId: null,
        developmentLevel: 0,
        mortgaged: false,
      },
    ],
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  });
}

describe("isAiSeatForPresentation", () => {
  it("includes dedicated AI seats and kick replacements", () => {
    const state = baseState();
    expect(isAiSeatForPresentation(state, "ai:bot")).toBe(true);
    const kicked = replaceKickedPlayerWithAi(state, "human-a");
    expect(isAiSeatForPresentation(kicked, "human-a")).toBe(true);
  });

  it("excludes timeout takeovers and plain humans", () => {
    const state = applyTimeoutTakeover(baseState(), "human-a");
    expect(isAiSeatForPresentation(state, "human-a")).toBe(false);
    expect(isAiSeatForPresentation(baseState(), "human-a")).toBe(false);
  });
});

describe("classifyAiPresentationBeat", () => {
  it("marks ownership change as material", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.tiles[0] = { ...next.tiles[0], ownerId: "ai:bot" };
    next.players[1] = {
      ...next.players[1],
      ownedTilePositions: [1],
      capital: 1400,
    };
    const beat = classifyAiPresentationBeat(prev, next, {
      type: "buy_tile",
    });
    expect(beat.material).toBe(true);
    expect(beat.reason).toBe("ownership_change");
    expect(beat.softTurnEnd).toBe(false);
  });

  it("marks soft turn-end when end_turn and turn had no material", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.currentPlayerIndex = 0;
    next.phase = "waiting_for_roll";
    const beat = classifyAiPresentationBeat(
      prev,
      next,
      { type: "end_turn" },
      { turnHadMaterial: false },
    );
    expect(beat.material).toBe(false);
    expect(beat.softTurnEnd).toBe(true);
  });

  it("does not soft-end when turn already had material", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.currentPlayerIndex = 0;
    const beat = classifyAiPresentationBeat(
      prev,
      next,
      { type: "end_turn" },
      { turnHadMaterial: true },
    );
    expect(beat.softTurnEnd).toBe(false);
  });

  it("ignores sub-threshold capital-only churn without ownership/auction", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.players[1] = { ...next.players[1], capital: 1480 };
    const beat = classifyAiPresentationBeat(prev, next, {
      type: "roll_dice",
      result: [1, 2],
    });
    expect(beat.material).toBe(false);
    expect(beat.softTurnEnd).toBe(false);
  });

  it("marks capital transfer at threshold", () => {
    const prev = baseState();
    const next = structuredClone(prev);
    next.players[0] = { ...next.players[0], capital: 1550 };
    next.players[1] = { ...next.players[1], capital: 1450 };
    const beat = classifyAiPresentationBeat(prev, next, {
      type: "roll_dice",
      result: [3, 4],
    });
    expect(beat.material).toBe(true);
    expect(beat.reason).toBe("capital_transfer");
  });
});

describe("stateVersion", () => {
  it("defaults stateVersion to 0", () => {
    const state = normalizeGameState({
      gameId: "g-version",
      round: 1,
      phase: "waiting_for_roll",
      currentPlayerIndex: 0,
      turnOrder: ["a"],
      freeMarketPool: 0,
      affinityAssignments: {},
      players: [],
      tiles: [],
      pendingBuyTilePosition: null,
      lastDiceRoll: null,
      winnerId: null,
      eliminatedPlayerIds: [],
      settings: {},
    });
    expect(state.stateVersion).toBe(0);
  });
});
