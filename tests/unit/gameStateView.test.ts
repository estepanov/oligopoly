import { describe, expect, it } from "vitest";
import {
  type PersistedGameState,
  toClientGameState,
} from "../../packages/worker/src/gameStateView";

function baseState(): PersistedGameState {
  return {
    gameId: "game-1",
    round: 3,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    players: [],
    tiles: [],
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  } as PersistedGameState;
}

describe("toClientGameState negotiation visibility", () => {
  it("shows open threads to all players", () => {
    const state = baseState();
    state.negotiationThreads = [
      {
        id: "thread-open",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "open",
      },
      {
        id: "thread-private",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "private",
      },
    ];

    const client = toClientGameState(state, "player", "p3");
    expect(client.negotiationThreads?.map((entry) => entry.id)).toEqual([
      "thread-open",
    ]);
  });

  it("still keeps private threads visible to participants", () => {
    const state = baseState();
    state.negotiationThreads = [
      {
        id: "thread-private",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "private",
      },
    ];

    const client = toClientGameState(state, "player", "p2");
    expect(client.negotiationThreads?.map((entry) => entry.id)).toEqual([
      "thread-private",
    ]);
  });
});
