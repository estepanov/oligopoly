import {
  buildMarketEventDeck,
  drawAndResolveMarketEvent,
  type InternalGameState,
  initTileStates,
  MARKET_EVENT_DECK_IDS,
  recordAuctionSubmission,
  resolveMarketEventCard,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function makeMarketEventState(
  overrides?: Partial<InternalGameState>,
): InternalGameState {
  return {
    gameId: "market-game",
    round: 1,
    phase: "waiting_for_market_event",
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
    marketEventDeckRemaining: ["stimulus_package", "market_crash"],
    marketEventDiscard: [],
    ...overrides,
  };
}

describe("buildMarketEventDeck", () => {
  it("shuffles the full deck deterministically from gameId", () => {
    const deckA = buildMarketEventDeck(undefined, "game-a");
    const deckB = buildMarketEventDeck(undefined, "game-a");
    const deckC = buildMarketEventDeck(undefined, "game-b");

    expect(deckA).toHaveLength(MARKET_EVENT_DECK_IDS.length);
    expect(deckA).toEqual(deckB);
    expect(deckA).not.toEqual(deckC);
  });

  it("filters custom deck selections to known card ids", () => {
    const deck = buildMarketEventDeck(
      {
        marketEventDeckCardIds: [
          "stimulus_package",
          "unknown_card",
          "recession",
        ],
      },
      "custom-game",
    );
    expect(deck.sort()).toEqual(["recession", "stimulus_package"].sort());
  });

  it("includes enabled optional cards in the default deck", () => {
    const deck = buildMarketEventDeck(
      {
        optionalMarketEventCardIds: [
          "optional_leveraged_buyout",
          "optional_black_swan_event",
        ],
      },
      "optional-game",
    );

    expect(deck).toHaveLength(MARKET_EVENT_DECK_IDS.length + 2);
    expect(deck).toContain("optional_leveraged_buyout");
    expect(deck).toContain("optional_black_swan_event");
  });

  it("accepts optional card ids in custom deck selections", () => {
    const deck = buildMarketEventDeck(
      {
        marketEventDeckCardIds: [
          "stimulus_package",
          "optional_sovereign_wealth_fund",
          "unknown_card",
        ],
      },
      "custom-optional-game",
    );

    expect(deck.sort()).toEqual(
      ["optional_sovereign_wealth_fund", "stimulus_package"].sort(),
    );
  });
});

describe("drawAndResolveMarketEvent", () => {
  it("draws, resolves, and advances round-start phase to waiting_for_roll", () => {
    const state = makeMarketEventState();
    const result = drawAndResolveMarketEvent(state, "player-1", "round_start");

    expect(result.state.phase).toBe("waiting_for_roll");
    expect(result.state.marketEventDeckRemaining).toEqual(["market_crash"]);
    expect(result.state.marketEventDiscard).toEqual(["stimulus_package"]);
    expect(
      result.logEntries.some((e) => e.actionType === "market_event_drawn"),
    ).toBe(true);
    expect(
      result.logEntries.some((e) => e.actionType === "market_event_resolved"),
    ).toBe(true);
    expect(
      result.state.players.every((player) => player.capital === 1600),
    ).toBe(true);
  });

  it("leaves tile draws in the current phase", () => {
    const state = makeMarketEventState({ phase: "action" });
    const result = drawAndResolveMarketEvent(state, "player-1", "tile", 2);

    expect(result.state.phase).toBe("action");
    expect(result.logEntries[0]?.payload).toMatchObject({
      trigger: "tile",
      tilePosition: 2,
    });
  });

  it("handles an empty deck at round start", () => {
    const state = makeMarketEventState({ marketEventDeckRemaining: [] });
    const result = drawAndResolveMarketEvent(state, "player-1", "round_start");

    expect(result.state.phase).toBe("waiting_for_roll");
    expect(
      result.logEntries.some((e) => e.actionType === "market_event_deck_empty"),
    ).toBe(true);
  });

  it("preserves auction phase after optional_leveraged_buyout on round start", () => {
    const state = makeMarketEventState({
      marketEventDeckRemaining: ["optional_leveraged_buyout", "market_crash"],
      players: [
        {
          playerId: "player-1",
          position: 0,
          capital: 1500,
          ownedTilePositions: [1, 3],
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
          ownedTilePositions: [6],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 0,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
      ],
    });
    state.tiles.find((tile) => tile.position === 1)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 3)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 6)!.ownerId = "player-2";

    const result = drawAndResolveMarketEvent(state, "player-1", "round_start");

    expect(result.state.phase).toBe("waiting_for_auction_bids");
    expect(result.state.pendingAuction).toBeDefined();
    expect(result.state.pendingAuction?.tilePosition).toBe(6);
    expect(result.state.pendingAuction?.sellerId).toBe("player-2");
    expect(result.state.pendingAuction?.trigger).toBe("player_initiated");
    expect(result.state.pendingAuction?.resumePhase).toBe("waiting_for_roll");
  });

  it("grants AP when leveraged-buyout auction settles back to waiting_for_roll", () => {
    const state = makeMarketEventState({
      settings: { auctionType: "open_bids" },
      marketEventDeckRemaining: ["optional_leveraged_buyout", "market_crash"],
      players: [
        {
          playerId: "player-1",
          position: 0,
          capital: 1500,
          ownedTilePositions: [1, 3],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 0,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
        {
          playerId: "player-2",
          position: 0,
          capital: 1500,
          ownedTilePositions: [6],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 0,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
      ],
    });
    state.tiles.find((tile) => tile.position === 1)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 3)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 6)!.ownerId = "player-2";

    const drawn = drawAndResolveMarketEvent(state, "player-1", "round_start");
    expect(drawn.state.phase).toBe("waiting_for_auction_bids");

    const settled = recordAuctionSubmission(drawn.state, "player-1", 1);
    expect(settled.state.phase).toBe("waiting_for_roll");
    expect(
      settled.state.players.find((player) => player.playerId === "player-1")
        ?.actionPointsRemaining,
    ).toBe(2);
  });

  it("pays the seller and removes ownership when leveraged-buyout auctions settle", () => {
    const state = makeMarketEventState({
      settings: { auctionType: "open_bids" },
      marketEventDeckRemaining: ["optional_leveraged_buyout", "market_crash"],
      players: [
        {
          playerId: "player-1",
          position: 0,
          capital: 1500,
          ownedTilePositions: [1, 3],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 0,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
        {
          playerId: "player-2",
          position: 0,
          capital: 1500,
          ownedTilePositions: [6],
          mortgagedTilePositions: [],
          developmentTokens: {},
          trustworthiness: 7,
          actionPointsRemaining: 0,
          inRegulation: false,
          doublesCount: 0,
          isOnDiagonal: false,
        },
      ],
    });
    state.tiles.find((tile) => tile.position === 1)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 3)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 6)!.ownerId = "player-2";

    const drawn = drawAndResolveMarketEvent(state, "player-1", "round_start");
    const settled = recordAuctionSubmission(drawn.state, "player-1", 1);

    const buyer = settled.state.players.find(
      (player) => player.playerId === "player-1",
    );
    const seller = settled.state.players.find(
      (player) => player.playerId === "player-2",
    );
    const tile = settled.state.tiles.find((entry) => entry.position === 6);

    expect(buyer?.capital).toBe(1499);
    expect(buyer?.ownedTilePositions).toContain(6);
    expect(seller?.capital).toBe(1501);
    expect(seller?.ownedTilePositions).not.toContain(6);
    expect(tile?.ownerId).toBe("player-1");
  });

  it("does not let a pending syndicate vote block round-start roll readiness", () => {
    const state = makeMarketEventState({
      pendingSyndicateVote: {
        syndicateId: "s1",
        voteType: "dissolve_syndicate",
        votes: { "player-1": true },
      },
    });

    const result = drawAndResolveMarketEvent(state, "player-1", "round_start");

    expect(result.state.phase).toBe("waiting_for_roll");
    expect(result.state.pendingSyndicateVote).toEqual({
      syndicateId: "s1",
      voteType: "dissolve_syndicate",
      votes: { "player-1": true },
    });
  });

  it("optional_dark_pool_transfer moves a seeded owned tile, not always the first", () => {
    const state = makeMarketEventState({
      gameId: "dark-pool-seed",
      marketEventDeckRemaining: ["optional_dark_pool_transfer"],
      players: [
        {
          playerId: "player-1",
          position: 0,
          capital: 1500,
          ownedTilePositions: [1, 6],
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
    });
    state.tiles.find((tile) => tile.position === 1)!.ownerId = "player-1";
    state.tiles.find((tile) => tile.position === 6)!.ownerId = "player-1";

    const result = drawAndResolveMarketEvent(state, "player-1", "round_start");
    const transferLog = result.logEntries.find(
      (entry) => entry.actionType === "dark_pool_transfer",
    );
    const transferred = transferLog?.payload?.tilePosition;
    expect([1, 6].map(String)).toContain(String(transferred));
    expect(
      result.state.tiles.find(
        (tile) => String(tile.position) === String(transferred),
      )?.ownerId,
    ).toBe("player-2");
  });
});

describe("resolveMarketEventCard", () => {
  it("applies windfall tax to the richest player", () => {
    const state = makeMarketEventState({
      players: [
        {
          playerId: "player-1",
          position: 0,
          capital: 1200,
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
          capital: 1800,
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
      marketEventDeckRemaining: ["windfall_tax"],
    });
    const logs: Array<{
      actionType: string;
      playerId: string | null;
      payload: unknown;
    }> = [];

    resolveMarketEventCard(state, "windfall_tax", "player-1", logs);

    const richest = state.players.find(
      (player) => player.playerId === "player-2",
    )!;
    expect(richest.capital).toBe(1700);
    expect(state.freeMarketPool).toBe(100);
    expect(
      logs.some((entry) => entry.actionType === "market_event_capital_change"),
    ).toBe(true);
  });

  it("logs the applied capital delta when balance is floored at zero", () => {
    const state = makeMarketEventState({
      players: [
        {
          playerId: "player-1",
          position: 0,
          capital: 20,
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
      marketEventDeckRemaining: ["recession"],
    });
    const logs: Array<{
      actionType: string;
      playerId: string | null;
      payload: Record<string, unknown> | null;
    }> = [];

    resolveMarketEventCard(state, "recession", "player-1", logs);

    const player = state.players.find(
      (entry) => entry.playerId === "player-1",
    )!;
    expect(player.capital).toBe(0);
    const changeLog = logs.find(
      (entry) =>
        entry.actionType === "market_event_capital_change" &&
        entry.playerId === "player-1",
    );
    expect(changeLog?.payload?.delta).toBe(-20);
    expect(changeLog?.payload?.capital).toBe(0);
  });
});
