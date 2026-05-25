// ---------------------------------------------------------------------------
// Authoritative game transitions: (persisted state, action, actor) → next state.
//
// Persistence notes (see worker GET /api/games/:id/state):
// - `affinityAssignments` is server-only (full map). API responses replace it
//   with `myAffinityCardId` per viewer.
// - `state_json` is versioned implicitly by the engine; treat unknown fields as
//   forward-compatible passthrough where possible.
// ---------------------------------------------------------------------------

import type {
  GameAction,
  GameEngineErrorKey,
  GameState,
  PlayerState,
} from "@oligopoly/validation";
import { GameEngineErrorKeys } from "@oligopoly/validation";
import { isDoubles, moveOnPerimeter, TRIPLE_DOUBLES_LIMIT } from "./dice.js";
import { applyAction, normalizeGameState } from "./gameStateMachine.js";
import type { GameActionInput } from "./gameStateTypes.js";
import { ACTION_POINTS_PER_TURN, PASS_START_BONUS } from "./setup.js";
import { deepClone } from "./stateUtils.js";

/** Full row shape stored in `games.state_json` (superset of public `GameState`). */
export type EngineGameState = GameState & {
  affinityAssignments?: Record<string, string>;
  /** Set after a roll this turn; cleared on end_turn (mirrors gameStateMachine). */
  lastDiceRoll?: [number, number] | null;
};

export type ApplyGameActionContext = {
  actorId: string;
  /**
   * Server must supply cryptographically sound dice. When absent (e.g. narrow
   * unit tests), `roll_dice.result` on the action must be present.
   */
  rollDice?: () => [number, number];
};

export type ApplyGameActionSuccess = {
  ok: true;
  state: EngineGameState;
  /** `game_log.action_type` */
  logActionType: string;
  logPayload: Record<string, unknown>;
};

export type ApplyGameActionFailure = {
  ok: false;
  errorKey: GameEngineErrorKey;
};

export type ApplyGameActionResult =
  | ApplyGameActionSuccess
  | ApplyGameActionFailure;

function currentPlayerId(state: EngineGameState): string | undefined {
  const order = state.turnOrder;
  const idx = state.currentPlayerIndex;
  if (!order?.length || idx === undefined || idx < 0 || idx >= order.length) {
    return undefined;
  }
  return order[idx];
}

function playerById(
  state: EngineGameState,
  id: string,
): PlayerState | undefined {
  return state.players?.find((p) => p.playerId === id);
}

function cloneState(state: EngineGameState): EngineGameState {
  return JSON.parse(JSON.stringify(state)) as EngineGameState;
}

function resolveDiceRoll(
  action: Extract<GameAction, { type: "roll_dice" }>,
  ctx: ApplyGameActionContext,
): [number, number] | ApplyGameActionFailure {
  if (ctx.rollDice) {
    return ctx.rollDice();
  }
  if (action.result !== undefined) {
    return action.result;
  }
  return {
    ok: false,
    errorKey: GameEngineErrorKeys.DICE_RESULT_REQUIRED,
  };
}

function applyRollDice(
  state: EngineGameState,
  action: Extract<GameAction, { type: "roll_dice" }>,
  ctx: ApplyGameActionContext,
): ApplyGameActionResult {
  const expected = currentPlayerId(state);
  if (!expected || expected !== ctx.actorId) {
    return { ok: false, errorKey: GameEngineErrorKeys.NOT_YOUR_TURN };
  }

  const phase = state.phase ?? "action";
  if (
    phase !== "action" &&
    phase !== "market_event" &&
    phase !== "rolling_doubles"
  ) {
    return { ok: false, errorKey: GameEngineErrorKeys.INVALID_PHASE };
  }

  const me = playerById(state, ctx.actorId);
  if (!me) {
    return { ok: false, errorKey: GameEngineErrorKeys.INVALID_PLAYER_STATE };
  }

  const mayRerollDoubles =
    state.lastDiceRoll !== undefined &&
    state.lastDiceRoll !== null &&
    isDoubles(state.lastDiceRoll) &&
    me.doublesCount > 0 &&
    me.doublesCount < TRIPLE_DOUBLES_LIMIT;

  if (me.actionPointsRemaining !== 0 && !mayRerollDoubles) {
    return { ok: false, errorKey: GameEngineErrorKeys.DICE_ALREADY_ROLLED };
  }

  const rollOutcome = resolveDiceRoll(action, ctx);
  if ("ok" in rollOutcome) {
    return rollOutcome;
  }
  const roll = rollOutcome;

  if (typeof me.position !== "number") {
    return { ok: false, errorKey: GameEngineErrorKeys.INVALID_PLAYER_STATE };
  }
  const startPosition = me.position;

  const next = cloneState(state);

  const players = next.players;
  if (!players) {
    return { ok: false, errorKey: GameEngineErrorKeys.INVALID_PLAYER_STATE };
  }

  const idx = players.findIndex((p) => p.playerId === ctx.actorId);
  if (idx < 0) {
    return { ok: false, errorKey: GameEngineErrorKeys.INVALID_PLAYER_STATE };
  }

  const p = { ...players[idx] } as PlayerState;
  const total = roll[0] + roll[1];
  const { newPosition, passedStart } = moveOnPerimeter(startPosition, total);
  p.position = newPosition;
  if (passedStart) {
    p.capital += PASS_START_BONUS;
  }

  let doublesCount = p.doublesCount;
  if (isDoubles(roll)) {
    doublesCount += 1;
    if (doublesCount >= TRIPLE_DOUBLES_LIMIT) {
      p.inRegulation = true;
      doublesCount = 0;
    }
  } else {
    doublesCount = 0;
  }
  p.doublesCount = doublesCount;
  p.actionPointsRemaining = ACTION_POINTS_PER_TURN;

  players[idx] = p;
  next.players = players;
  next.lastDiceRoll = roll;

  if (
    isDoubles(roll) &&
    doublesCount > 0 &&
    doublesCount < TRIPLE_DOUBLES_LIMIT
  ) {
    next.phase = "rolling_doubles";
  } else {
    next.phase = "action";
  }

  return {
    ok: true,
    state: next,
    logActionType: "roll_dice",
    logPayload: { roll, newPosition, passedStart },
  };
}

function applyEndTurn(
  state: EngineGameState,
  _action: Extract<GameAction, { type: "end_turn" }>,
  ctx: ApplyGameActionContext,
): ApplyGameActionResult {
  const expected = currentPlayerId(state);
  if (!expected || expected !== ctx.actorId) {
    return { ok: false, errorKey: GameEngineErrorKeys.NOT_YOUR_TURN };
  }

  const order = state.turnOrder;
  const curIdx = state.currentPlayerIndex;
  if (
    !order?.length ||
    curIdx === undefined ||
    curIdx < 0 ||
    curIdx >= order.length
  ) {
    return { ok: false, errorKey: GameEngineErrorKeys.INVALID_PLAYER_STATE };
  }

  const phase = state.phase ?? "action";
  if (phase !== "action" || !state.lastDiceRoll) {
    return { ok: false, errorKey: GameEngineErrorKeys.CANNOT_END_TURN };
  }

  const next = cloneState(state);
  const players = next.players?.map((pl) =>
    pl.playerId === ctx.actorId
      ? { ...pl, actionPointsRemaining: 0, doublesCount: 0 }
      : pl,
  );
  next.players = players;
  next.lastDiceRoll = null;
  next.phase = "market_event";

  const followingIndex = (curIdx + 1) % order.length;
  next.currentPlayerIndex = followingIndex;
  if (followingIndex === 0) {
    next.round = (next.round ?? 1) + 1;
  }

  return {
    ok: true,
    state: next,
    logActionType: "end_turn",
    logPayload: {
      previousPlayerIndex: curIdx,
      nextPlayerIndex: followingIndex,
    },
  };
}

function mapEngineThrow(err: unknown): GameEngineErrorKey {
  if (typeof err === "string" && err.startsWith("game.")) {
    return err as GameEngineErrorKey;
  }
  return GameEngineErrorKeys.INVALID_ACTION;
}

/** Delegates to authoritative `applyAction` for actions not inlined here. */
function delegateToApplyAction(
  state: EngineGameState,
  action: GameAction,
  ctx: ApplyGameActionContext,
): ApplyGameActionResult {
  try {
    const internal = normalizeGameState(
      deepClone(state) as unknown as Record<string, unknown>,
    );
    const result = applyAction(
      internal,
      ctx.actorId,
      action as GameActionInput,
    );
    const primary =
      result.logEntries.find((entry) => entry.playerId === ctx.actorId) ??
      result.logEntries[result.logEntries.length - 1];
    return {
      ok: true,
      state: result.state as unknown as EngineGameState,
      logActionType: primary?.actionType ?? action.type,
      logPayload: (primary?.payload ?? {}) as Record<string, unknown>,
    };
  } catch (err) {
    return { ok: false, errorKey: mapEngineThrow(err) };
  }
}

/**
 * Incremental roll/end-turn helper for unit tests. HTTP routes use
 * `applyAction` in `gameStateMachine.ts` as the authoritative engine.
 */
export function applyGameAction(
  state: EngineGameState,
  action: GameAction,
  ctx: ApplyGameActionContext,
): ApplyGameActionResult {
  switch (action.type) {
    case "roll_dice":
      return applyRollDice(state, action, ctx);
    case "end_turn":
      return applyEndTurn(state, action, ctx);
    default:
      return delegateToApplyAction(state, action, ctx);
  }
}
