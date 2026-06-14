import type { InternalGameState, LogEntry } from "@oligopoly/shared";
import {
  applyWinIfThresholdCrossed,
  checkWinConditions,
  initTileStates,
  TOTAL_BOARD_MARKET_VALUE,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function makeState(overrides?: Partial<InternalGameState>): InternalGameState {
  return {
    gameId: "game-1",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    kickedPlayerIds: [],
    tiles: initTileStates(),
    players: [
      {
        playerId: "p1",
        capital: 100,
        position: 0,
        isOnDiagonal: false,
        doublesCount: 0,
        actionPointsRemaining: 3,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        inRegulation: false,
      },
      {
        playerId: "p2",
        capital: 100,
        position: 0,
        isOnDiagonal: false,
        doublesCount: 0,
        actionPointsRemaining: 3,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        inRegulation: false,
      },
    ],
    settings: {},
    ...overrides,
  };
}

function givePlayerFullBoard(state: InternalGameState, playerId: string) {
  const owned: Array<number | string> = [];
  for (const tile of state.tiles) {
    tile.ownerId = playerId;
    owned.push(tile.position);
  }
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (player) {
    player.ownedTilePositions = owned;
  }
}

describe("winResolution", () => {
  it("detects solo win when market value crosses threshold", () => {
    const state = makeState();
    givePlayerFullBoard(state, "p1");

    expect(checkWinConditions(state)).toBe("p1");
  });

  it("ends the game when ownership crosses threshold", () => {
    const state = makeState();
    givePlayerFullBoard(state, "p2");
    const logs: LogEntry[] = [];

    applyWinIfThresholdCrossed(state, logs);

    expect(state.phase).toBe("game_over");
    expect(state.winnerId).toBe("p2");
    expect(logs.some((entry) => entry.actionType === "game_won")).toBe(true);
    expect(
      logs.find((entry) => entry.actionType === "game_won")?.payload,
    ).toMatchObject({
      winnerId: "p2",
      totalMarketValue: TOTAL_BOARD_MARKET_VALUE,
    });
  });

  it("terminates still-pending trade offers when the game ends", () => {
    const state = makeState({
      tradeOffers: [
        {
          id: "trade-game-1-1",
          gameId: "game-1",
          proposerId: "p1",
          recipientId: "p2",
          gives: { capital: 50, tilePositions: [] },
          receives: { capital: 0, tilePositions: [] },
          status: "pending",
          createdAt: 1,
          expiresAt: Date.now() + 300_000,
          counterCount: 0,
        },
        {
          id: "trade-game-1-2",
          gameId: "game-1",
          proposerId: "p2",
          recipientId: "p1",
          gives: { capital: 10, tilePositions: [] },
          receives: { capital: 0, tilePositions: [] },
          status: "rejected",
          createdAt: 1,
          expiresAt: Date.now() + 300_000,
          counterCount: 0,
        },
      ],
    });
    givePlayerFullBoard(state, "p2");
    const logs: LogEntry[] = [];

    applyWinIfThresholdCrossed(state, logs);

    expect(state.phase).toBe("game_over");
    // The previously-pending offer is now terminal; the already-resolved one is
    // untouched. No offer is left dangling.
    const offerById = new Map(
      (state.tradeOffers ?? []).map((offer) => [offer.id, offer.status]),
    );
    expect(offerById.get("trade-game-1-1")).toBe("expired");
    expect(offerById.get("trade-game-1-2")).toBe("rejected");
    expect(
      (state.tradeOffers ?? []).some((offer) => offer.status === "pending"),
    ).toBe(false);
    // A redactable log entry is emitted for the offer terminated at game over.
    const expiredLog = logs.find(
      (entry) =>
        entry.actionType === "trade_expired" &&
        (entry.payload as { offerId?: string } | null)?.offerId ===
          "trade-game-1-1",
    );
    expect(expiredLog).toBeDefined();
  });
});
