import { getTileByPosition } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";
import { initTileStates } from "../../packages/shared/src/engine/gameStateMachine.js";
import type { InternalGameState } from "../../packages/shared/src/engine/gameStateTypes.js";
import { handleHostileTakeover } from "../../packages/shared/src/engine/optionalRuleActions.js";

function baseState(): InternalGameState {
  return {
    gameId: "g1",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [
      {
        playerId: "p1",
        capital: 5000,
        position: 0,
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
        playerId: "p2",
        capital: 5000,
        position: 0,
        ownedTilePositions: [1],
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
      String(tile.position) === "1" ? { ...tile, ownerId: "p2" } : tile,
    ),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: { optionalRuleIds: ["hostile_takeover"] },
  };
}

describe("handleHostileTakeover", () => {
  it("transfers a sector tile at 150% acquisition cost", () => {
    const state = baseState();
    const tile = getTileByPosition(1);
    expect(tile?.cost).toBe(60);

    const result = handleHostileTakeover(state, "p1", {
      type: "hostile_takeover",
      targetPlayerId: "p2",
      tilePosition: 1,
    });

    const buyer = result.state.players.find(
      (player) => player.playerId === "p1",
    );
    const seller = result.state.players.find(
      (player) => player.playerId === "p2",
    );
    expect(buyer?.capital).toBe(5000 - 90);
    expect(seller?.capital).toBe(5000 + 90);
    expect(buyer?.ownedTilePositions).toContain(1);
    expect(seller?.ownedTilePositions).not.toContain(1);
    expect(buyer?.hostileTakeoverUsed).toBe(true);
  });
});
