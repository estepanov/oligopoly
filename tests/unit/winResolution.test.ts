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
    expect(logs.at(-1)?.actionType).toBe("game_won");
    expect(logs.at(-1)?.payload).toMatchObject({
      winnerId: "p2",
      totalMarketValue: TOTAL_BOARD_MARKET_VALUE,
    });
  });
});
