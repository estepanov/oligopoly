import { describe, expect, it } from "vitest";
import {
  handleBreakHandshake,
  handleProposeHandshake,
  handleSignHandshake,
} from "../../packages/shared/src/engine/handshakeActions.js";
import type { InternalGameState } from "../../packages/shared/src/engine/gameStateTypes.js";
import { initTileStates } from "../../packages/shared/src/engine/gameStateMachine.js";

function actionState(): InternalGameState {
  return {
    gameId: "g-handshake",
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
      },
    ],
    tiles: initTileStates(),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  };
}

describe("handshake actions", () => {
  it("proposes, signs, and breaks a handshake", () => {
    const proposed = handleProposeHandshake(actionState(), "p1", {
      type: "propose_handshake",
      partyB: "p2",
      summary: "No trades this round",
    });
    const handshakeId = proposed.state.handshakeAgreements?.[0]?.id;
    expect(handshakeId).toBeDefined();

    const signed = handleSignHandshake(proposed.state, "p2", {
      type: "sign_handshake",
      handshakeId: handshakeId!,
    });
    expect(signed.state.handshakeAgreements?.[0]?.status).toBe("active");

    const broken = handleBreakHandshake(signed.state, "p1", {
      type: "break_handshake",
      handshakeId: handshakeId!,
    });
    expect(broken.state.handshakeAgreements?.[0]?.status).toBe("broken");
    expect(
      broken.state.players.find((player) => player.playerId === "p1")
        ?.trustworthiness,
    ).toBe(5);
  });
});
