import {
  applyAction,
  initTileStates,
  normalizeGameState,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

function baseState() {
  return normalizeGameState({
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
        position: 0,
        capital: 5000,
        ownedTilePositions: [3],
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
        capital: 5000,
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
    tiles: initTileStates().map((t) =>
      String(t.position) === "3" ? { ...t, ownerId: "p1" } : t,
    ),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: { optionalRuleIds: [] },
  });
}

describe("propose_contract", () => {
  it("registers a binding contract with proposer signature", () => {
    const state = baseState();
    const result = applyAction(state, "p1", {
      type: "propose_contract",
      partyB: "p2",
      terms: [
        {
          type: "cannot_sell_tile",
          tileId: "3",
          boundPlayerId: "p1",
        },
      ],
    });

    expect(result.state.activeContracts).toHaveLength(1);
    expect(result.state.activeContracts?.[0].partySignatures?.p1).toBe(true);
    expect(
      result.logEntries.some((l) => l.actionType === "contract_proposed"),
    ).toBe(true);
  });
});
