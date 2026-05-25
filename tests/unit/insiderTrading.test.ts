import { describe, expect, it } from "vitest";
import {
  drawAndResolveMarketEvent,
  handleInsiderDiscardMarketEvent,
  shouldOfferInsiderPeek,
} from "@oligopoly/shared";
import type { InternalGameState } from "../../packages/shared/src/engine/gameStateTypes.js";
import { initTileStates } from "../../packages/shared/src/engine/gameStateMachine.js";

function marketEventState(): InternalGameState {
  return {
    gameId: "insider-game",
    round: 1,
    phase: "waiting_for_market_event",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [
      {
        playerId: "p1",
        capital: 1000,
        position: 0,
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
        capital: 1000,
        position: 0,
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
    tiles: initTileStates(),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {
      optionalRuleIds: ["insider_trading"],
      marketEventDeckCardIds: ["tech_boom", "bull_market", "recession"],
    },
    marketEventDeckRemaining: ["tech_boom", "bull_market", "recession"],
    marketEventDiscard: [],
  };
}

describe("insider trading", () => {
  it("offers peek only on round-start draws", () => {
    const state = marketEventState();
    expect(shouldOfferInsiderPeek(state, "p1", "round_start")).toBe(true);
    expect(shouldOfferInsiderPeek(state, "p1", "tile")).toBe(false);
  });

  it("returns a discarded peeked card to the bottom of the deck", () => {
    const state = marketEventState();
    const peek = drawAndResolveMarketEvent(state, "p1", "round_start");
    expect(peek.state.phase).toBe("waiting_for_insider_peek");
    expect(peek.state.pendingInsiderPeek?.cardId).toBe("tech_boom");

    const discarded = handleInsiderDiscardMarketEvent(peek.state, "p1");
    expect(discarded.state.marketEventDeckRemaining?.at(-1)).toBe("tech_boom");
    expect(discarded.state.marketEventDiscard).not.toContain("tech_boom");
    expect(discarded.state.phase).not.toBe("waiting_for_insider_peek");
  });
});
