import { describe, expect, it } from "vitest";
import { initTileStates } from "../../packages/shared/src/engine/gameStateMachine.js";
import type { InternalGameState } from "../../packages/shared/src/engine/gameStateTypes.js";
import { handleCallVote } from "../../packages/shared/src/engine/syndicateVoteActions.js";

function syndicateVoteState(): InternalGameState {
  return {
    gameId: "vote-game",
    round: 1,
    phase: "action",
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
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
        syndicateId: "s1",
      },
      {
        playerId: "p2",
        capital: 1000,
        position: 0,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
        syndicateId: "s1",
      },
    ],
    tiles: initTileStates(),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
    syndicates: {
      s1: {
        syndicateId: "s1",
        adminId: "p1",
        memberIds: ["p1", "p2"],
      },
    },
  };
}

describe("syndicate vote actions", () => {
  it("rejects repeat call_vote from the same member without spending AP", () => {
    const state = syndicateVoteState();
    const first = handleCallVote(state, "p1", {
      type: "call_vote",
      voteType: "dissolve_syndicate",
    });
    expect(
      first.state.players.find((p) => p.playerId === "p1")
        ?.actionPointsRemaining,
    ).toBe(1);
    expect(first.state.pendingSyndicateVote?.votes.p1).toBe(true);

    expect(() =>
      handleCallVote(first.state, "p1", {
        type: "call_vote",
        voteType: "dissolve_syndicate",
      }),
    ).toThrow("game.invalid_action");
    expect(
      first.state.players.find((p) => p.playerId === "p1")
        ?.actionPointsRemaining,
    ).toBe(1);
  });
});
