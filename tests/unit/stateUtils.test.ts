import { describe, expect, it } from "vitest";
import { initTileStates } from "../../packages/shared/src/engine/gameStateMachine.js";
import type { InternalGameState } from "../../packages/shared/src/engine/gameStateTypes.js";
import { transferTileOwnership } from "../../packages/shared/src/engine/stateUtils.js";

function makeState(): InternalGameState {
  return {
    gameId: "state-utils-game",
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
    tiles: initTileStates(),
    players: [
      {
        playerId: "p1",
        position: 0,
        capital: 1500,
        ownedTilePositions: [1],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
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
    settings: {},
  };
}

describe("transferTileOwnership", () => {
  it("leaves player ownership arrays untouched when the tile is missing", () => {
    const state = makeState();

    const changed = transferTileOwnership(state, "p1", "p2", 999);

    expect(changed).toBe(false);
    expect(state.players[0]?.ownedTilePositions).toEqual([1]);
    expect(state.players[1]?.ownedTilePositions).toEqual([]);
  });
});
