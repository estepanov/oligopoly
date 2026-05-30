import { applyGameAction, type EngineGameState } from "@oligopoly/shared";
import { GameEngineErrorKeys, GameErrorKeys } from "@oligopoly/validation";
import { describe, expect, it, vi } from "vitest";
import * as gameReducerModule from "../../packages/shared/src/engine/gameReducer.js";
import * as gameStateMachineModule from "../../packages/shared/src/engine/gameStateMachine.js";

function minimalTwoPlayerState(
  phase: "waiting_for_roll" | "action",
): EngineGameState {
  return {
    gameId: "g1",
    round: 1,
    phase,
    currentPlayerIndex: 0,
    turnOrder: ["alice", "bob"],
    freeMarketPool: 0,
    players: [
      {
        playerId: "alice",
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
        playerId: "bob",
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
    ],
    settings: {},
  };
}

describe("applyGameAction", () => {
  it("rejects roll_dice when it is not the actor's turn", () => {
    const state = minimalTwoPlayerState("action");
    const r = applyGameAction(
      state,
      { type: "roll_dice" },
      { actorId: "bob", rollDice: () => [1, 3] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorKey).toBe(GameEngineErrorKeys.NOT_YOUR_TURN);
    }
  });

  it("rolls from waiting_for_roll using ctx.rollDice and moves on the perimeter", () => {
    const state = minimalTwoPlayerState("waiting_for_roll");
    const r = applyGameAction(
      state,
      { type: "roll_dice" },
      { actorId: "alice", rollDice: () => [1, 3] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.state.phase).toBe("action");
    expect(r.state.players?.[0]?.position).toBe(4);
    expect(r.state.players?.[0]?.actionPointsRemaining).toBe(0);
    expect(r.logActionType).toBe("roll_dice");
  });

  it("uses action.result when rollDice is omitted (tests only)", () => {
    const state = minimalTwoPlayerState("waiting_for_roll");
    const r = applyGameAction(
      state,
      { type: "roll_dice", result: [1, 3] },
      { actorId: "alice" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.state.players?.[0]?.position).toBe(4);
    expect(r.state.players?.[0]?.doublesCount).toBe(0);
  });

  it("returns DICE_RESULT_REQUIRED when neither rollDice nor result is set", () => {
    const state = minimalTwoPlayerState("action");
    const r = applyGameAction(
      state,
      { type: "roll_dice" },
      { actorId: "alice" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorKey).toBe(GameEngineErrorKeys.DICE_RESULT_REQUIRED);
    }
  });

  it("advances turn on end_turn and increments round after a full cycle", () => {
    const state = minimalTwoPlayerState("waiting_for_roll");
    const rolled = applyGameAction(
      state,
      { type: "roll_dice", result: [1, 3] },
      { actorId: "alice" },
    );
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) {
      return;
    }

    const e1 = applyGameAction(
      rolled.state,
      { type: "end_turn" },
      {
        actorId: "alice",
      },
    );
    expect(e1.ok).toBe(true);
    if (!e1.ok) {
      return;
    }
    expect(e1.state.currentPlayerIndex).toBe(1);
    expect(e1.state.round).toBe(1);

    const bobRoll = applyGameAction(
      e1.state,
      { type: "roll_dice", result: [1, 3] },
      { actorId: "bob" },
    );
    expect(bobRoll.ok).toBe(true);
    if (!bobRoll.ok) {
      return;
    }

    const e2 = applyGameAction(
      bobRoll.state,
      { type: "end_turn" },
      {
        actorId: "bob",
      },
    );
    expect(e2.ok).toBe(true);
    if (!e2.ok) {
      return;
    }
    expect(e2.state.currentPlayerIndex).toBe(0);
    expect(e2.state.round).toBe(2);
  });

  it("rejects end_turn before rolling", () => {
    const state = minimalTwoPlayerState("waiting_for_roll");
    const r = applyGameAction(
      state,
      { type: "end_turn" },
      { actorId: "alice" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorKey).toBe(GameEngineErrorKeys.CANNOT_END_TURN);
    }
  });

  it("allows a second roll_dice after doubles", () => {
    const state = minimalTwoPlayerState("waiting_for_roll");
    const first = applyGameAction(
      state,
      { type: "roll_dice", result: [2, 2] },
      { actorId: "alice" },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.state.phase).toBe("rolling_doubles");
    expect(first.state.players?.[0]?.doublesCount).toBe(1);

    const second = applyGameAction(
      first.state,
      { type: "roll_dice", result: [2, 3] },
      { actorId: "alice" },
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.state.players?.[0]?.doublesCount).toBe(0);
    expect(second.state.phase).not.toBe("rolling_doubles");
  });

  it("delegates advanced actions to authoritative applyAction", () => {
    const state = minimalTwoPlayerState("action");
    const players = state.players;
    if (players?.[0]) {
      players[0].actionPointsRemaining = 2;
    }
    const r = applyGameAction(
      state,
      {
        type: "propose_handshake",
        partyB: "bob",
        summary: "No trades this round",
      },
      { actorId: "alice" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.state.handshakeAgreements?.length).toBe(1);
    expect(r.logActionType).toBe("handshake_proposed");
  });

  it("preserves specific engine error keys from applyAction", () => {
    const state = minimalTwoPlayerState("action");
    const result = applyGameAction(
      state,
      { type: "start_negotiation", targetPlayerIds: ["bob"] },
      { actorId: "alice" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKey).toBe(GameErrorKeys.INSUFFICIENT_AP);
    }
  });

  it("returns UNKNOWN_ENGINE_ERROR for unexpected string throws", () => {
    const spy = vi
      .spyOn(gameStateMachineModule, "applyAction")
      .mockImplementation(() => {
        throw "game.totally_unknown";
      });

    const result = gameReducerModule.applyGameAction(
      minimalTwoPlayerState("action"),
      { type: "end_turn" },
      { actorId: "alice" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKey).toBe(GameEngineErrorKeys.UNKNOWN_ENGINE_ERROR);
    }

    spy.mockRestore();
  });
});
