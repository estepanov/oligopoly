import {
  type BindingContract,
  chooseAiActionForPlayer,
  initTileStates,
  normalizeGameState,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

// State where AI seat `ai:bot` is on turn in the `action` phase with full action
// points and ample capital, and the only human-owned tile is position 6. The AI
// trade-proposal heuristic targets the cheapest tradeable opponent tile, so this
// is the minimal setup to exercise target selection.
function actionPhaseState() {
  return normalizeGameState({
    gameId: "trade-ai-game",
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
        ownedTilePositions: [6],
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
    tiles: initTileStates().map((tile) =>
      String(tile.position) === "6" ? { ...tile, ownerId: "human-a" } : tile,
    ),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: { optionalRuleIds: [] },
  });
}

function sellLock(tileId: string, boundPlayerId: string): BindingContract {
  return {
    id: "contract-1",
    gameId: "trade-ai-game",
    partyA: "human-a",
    partyB: "ai:bot",
    terms: [{ type: "cannot_sell_tile", tileId, boundPlayerId }],
    status: "active",
    startsRound: 1,
    expiresRound: null,
    signedAt: 1,
    fulfilledAt: null,
    breachedAt: null,
  };
}

describe("tradeAi target selection", () => {
  it("proposes a trade for an eligible opponent tile", () => {
    const decision = chooseAiActionForPlayer(actionPhaseState(), "ai:bot");
    expect(decision?.action.type).toBe("propose_trade");
    if (decision?.action.type === "propose_trade") {
      expect(decision.action.receives?.tilePositions).toEqual([6]);
    }
  });

  it("does not propose a trade for a contract-locked opponent tile", () => {
    const state = actionPhaseState();
    // The only opponent tile (6) is locked from sale by an active contract, so
    // the AI must NOT propose for it (which the engine would reject with
    // INVALID_TERMS, wasting the propose). It should fall through to end_turn.
    state.activeContracts = [sellLock("6", "human-a")];

    const decision = chooseAiActionForPlayer(state, "ai:bot");
    expect(decision?.action.type).toBe("end_turn");
  });

  it("does not propose a trade for a mortgaged opponent tile", () => {
    const state = actionPhaseState();
    const tile = state.tiles.find((t) => String(t.position) === "6");
    if (tile) tile.mortgaged = true;

    const decision = chooseAiActionForPlayer(state, "ai:bot");
    expect(decision?.action.type).toBe("end_turn");
  });
});
