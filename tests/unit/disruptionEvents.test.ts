import {
  buildDisruptionDeck,
  DISRUPTION_DECK_IDS,
  drawAndResolveDisruptionCards,
  type InternalGameState,
  initTileStates,
  resolveBlackMarketRelay,
  resolveDisruptionCard,
  resolveFlashCrash,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function makeDisruptionState(
  overrides?: Partial<InternalGameState>,
): InternalGameState {
  return {
    gameId: "disruption-game",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["player-1", "player-2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    tiles: initTileStates(),
    players: [
      {
        playerId: "player-1",
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
        playerId: "player-2",
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
    ],
    settings: {},
    disruptionDeckRemaining: [
      "disruption_patent_troll",
      "disruption_bridge_loan",
    ],
    disruptionDiscard: [],
    ...overrides,
  };
}

describe("buildDisruptionDeck", () => {
  it("shuffles the full deck deterministically from gameId", () => {
    const deckA = buildDisruptionDeck("game-a");
    const deckB = buildDisruptionDeck("game-a");
    const deckC = buildDisruptionDeck("game-b");

    expect(deckA).toHaveLength(DISRUPTION_DECK_IDS.length);
    expect(deckA).toEqual(deckB);
    expect(deckA).not.toEqual(deckC);
  });
});

describe("drawAndResolveDisruptionCards", () => {
  it("draws and resolves a disruption card from the deck", () => {
    const state = makeDisruptionState();
    const result = drawAndResolveDisruptionCards(
      state,
      "player-1",
      1,
      "tile",
      7,
    );

    expect(result.state.disruptionDeckRemaining).toEqual([
      "disruption_bridge_loan",
    ]);
    expect(result.state.disruptionDiscard).toEqual(["disruption_patent_troll"]);
    expect(
      result.logEntries.some((e) => e.actionType === "disruption_drawn"),
    ).toBe(true);
    expect(
      result.logEntries.some((e) => e.actionType === "disruption_resolved"),
    ).toBe(true);
    const drawer = result.state.players.find(
      (player) => player.playerId === "player-1",
    )!;
    expect(drawer.capital).toBe(1450);
  });

  it("draws twice when disruption blitz is enabled", () => {
    const state = makeDisruptionState({
      settings: { optionalRuleIds: ["disruption_blitz"] },
      disruptionDeckRemaining: [
        "disruption_patent_troll",
        "disruption_golden_parachute",
      ],
    });
    const result = drawAndResolveDisruptionCards(
      state,
      "player-1",
      2,
      "disruption_blitz",
      7,
    );

    expect(result.state.disruptionDeckRemaining).toEqual([]);
    expect(result.state.disruptionDiscard).toHaveLength(2);
    expect(
      result.logEntries.filter(
        (entry) => entry.actionType === "disruption_drawn",
      ),
    ).toHaveLength(2);
  });
});

describe("resolveBlackMarketRelay", () => {
  it("keeps one card deterministically and discards the other unseen", () => {
    const state = makeDisruptionState({
      disruptionDeckRemaining: [
        "disruption_bridge_loan",
        "disruption_patent_troll",
      ],
    });
    const result = resolveBlackMarketRelay(state, "player-1", "D4");

    expect(result.state.disruptionDeckRemaining).toEqual([]);
    expect(result.state.disruptionDiscard).toEqual([
      "disruption_patent_troll",
      "disruption_bridge_loan",
    ]);
    expect(
      result.logEntries.some(
        (e) => e.actionType === "black_market_relay_drawn",
      ),
    ).toBe(true);
    const drawer = result.state.players.find(
      (player) => player.playerId === "player-1",
    )!;
    expect(drawer.capital).toBe(1600);
  });
});

describe("resolveFlashCrash", () => {
  it("applies percentage losses and awards windfall to the landing player", () => {
    const state = makeDisruptionState();
    const result = resolveFlashCrash(state, "player-1", "D2");

    const p1 = result.state.players.find(
      (player) => player.playerId === "player-1",
    )!;
    const p2 = result.state.players.find(
      (player) => player.playerId === "player-2",
    )!;
    expect(p1.capital).toBe(1440);
    expect(p2.capital).toBe(1425);
    expect(
      result.logEntries.some((e) => e.actionType === "flash_crash_resolved"),
    ).toBe(true);
  });
});

describe("resolveDisruptionCard", () => {
  it("sends the drawer to regulation for go_to_regulation", () => {
    const state = makeDisruptionState();
    const logs: Array<{
      actionType: string;
      playerId: string | null;
      payload: unknown;
    }> = [];

    resolveDisruptionCard(
      state,
      "disruption_go_to_regulation",
      "player-1",
      logs,
    );

    const drawer = state.players.find(
      (player) => player.playerId === "player-1",
    )!;
    expect(drawer.position).toBe(10);
    expect(drawer.inRegulation).toBe(true);
    expect(
      logs.some((entry) => entry.actionType === "sent_to_regulation"),
    ).toBe(true);
  });
});
