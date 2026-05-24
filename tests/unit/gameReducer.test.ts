import { applyGameAction, type EngineGameState } from "@oligopoly/shared";
import { GameEngineErrorKeys } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

function minimalTwoPlayerState(
  phase: "market_event" | "action",
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
    const r = applyGameAction(state, { type: "roll_dice" }, { actorId: "bob" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorKey).toBe(GameEngineErrorKeys.NOT_YOUR_TURN);
    }
  });

  it("rolls from market_event using ctx.rollDice and moves on the perimeter", () => {
    const state = minimalTwoPlayerState("market_event");
    const r = applyGameAction(
      state,
      { type: "roll_dice" },
      { actorId: "alice", rollDice: () => [2, 3] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.state.phase).toBe("action");
    expect(r.state.players?.[0]?.position).toBe(5);
    expect(r.state.players?.[0]?.actionPointsRemaining).toBe(2);
    expect(r.logActionType).toBe("roll_dice");
  });

  it("uses action.result when rollDice is omitted (tests only)", () => {
    const state = minimalTwoPlayerState("action");
    const r = applyGameAction(
      state,
      { type: "roll_dice", result: [1, 1] },
      { actorId: "alice" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.state.players?.[0]?.position).toBe(2);
    expect(r.state.players?.[0]?.doublesCount).toBe(1);
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
    const state = minimalTwoPlayerState("market_event");
    const rolled = applyGameAction(
      state,
      { type: "roll_dice", result: [2, 3] },
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
      { type: "roll_dice", result: [1, 2] },
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
    const state = minimalTwoPlayerState("market_event");
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
    const state = minimalTwoPlayerState("market_event");
    const first = applyGameAction(
      state,
      { type: "roll_dice", result: [4, 4] },
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
    expect(second.state.phase).toBe("action");
  });

  it("returns ACTION_NOT_IMPLEMENTED for buy_tile", () => {
    const state = minimalTwoPlayerState("action");
    const r = applyGameAction(
      state,
      { type: "buy_tile", tilePosition: 1 },
      { actorId: "alice" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorKey).toBe(GameEngineErrorKeys.ACTION_NOT_IMPLEMENTED);
    }
  });
});
