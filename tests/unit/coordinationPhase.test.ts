import {
  applyAction,
  initTileStates,
  normalizeGameState,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function givePlayerFullBoard(
  state: ReturnType<typeof normalizeGameState>,
  playerId: string,
) {
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
      tiles: initTileStates(),
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

  it("stays in game_over when round housekeeping finalizes a win", () => {
    const state = normalizeGameState({
      gameId: "g-win-round",
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
      tiles: initTileStates(),
      pendingBuyTilePosition: null,
      lastDiceRoll: null,
      winnerId: null,
      eliminatedPlayerIds: [],
      settings: {},
    });
    givePlayerFullBoard(state, "p1");

    const result = applyAction(state, "p2", { type: "end_turn" });

    expect(result.state.phase).toBe("game_over");
    expect(result.state.winnerId).toBe("p1");
    expect(
      result.logEntries.some(
        (entry) => entry.actionType === "round_boundary_complete",
      ),
    ).toBe(true);
  });
});
