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
} from "@oligopoly/validation";
import { GameEngineErrorKeys, GameErrorKeys } from "@oligopoly/validation";
import { applyAction, normalizeGameState } from "./gameStateMachine.js";
import type { GameActionInput } from "./gameStateTypes.js";
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

function resolveRollInput(
  action: Extract<GameAction, { type: "roll_dice" }>,
  ctx: ApplyGameActionContext,
): GameActionInput | ApplyGameActionFailure {
  const result = ctx.rollDice?.() ?? action.result;
  if (result) {
    return { ...action, result };
  }
  return {
    ok: false,
    errorKey: GameEngineErrorKeys.DICE_RESULT_REQUIRED,
  };
}

function toEngineActionInput(
  action: GameAction,
  ctx: ApplyGameActionContext,
): GameActionInput | ApplyGameActionFailure {
  if (action.type !== "roll_dice") {
    return action;
  }
  return resolveRollInput(action, ctx);
}

const KNOWN_ENGINE_ERROR_KEYS = new Set<string>([
  ...Object.values(GameEngineErrorKeys),
  ...Object.values(GameErrorKeys),
]);

function mapEngineThrow(err: unknown): GameEngineErrorKey {
  if (typeof err === "string" && KNOWN_ENGINE_ERROR_KEYS.has(err)) {
    return err as GameEngineErrorKey;
  }
  return GameEngineErrorKeys.INVALID_ACTION;
}

function toInternalState(state: EngineGameState) {
  return normalizeGameState(deepClone(state));
}

function toEngineState(
  state: ReturnType<typeof toInternalState>,
): EngineGameState {
  return deepClone(state) as EngineGameState;
}

function applyViaAuthoritativeStateMachine(
  state: EngineGameState,
  action: GameAction,
  ctx: ApplyGameActionContext,
): ApplyGameActionResult {
  const actionInput = toEngineActionInput(action, ctx);
  if ("ok" in actionInput) {
    return actionInput;
  }

  try {
    const internal = toInternalState(state);
    const result = applyAction(internal, ctx.actorId, actionInput);
    const primary =
      result.primaryLogIndex !== undefined
        ? result.logEntries[result.primaryLogIndex]
        : result.logEntries[0];
    return {
      ok: true,
      state: toEngineState(result.state),
      logActionType: primary?.actionType ?? action.type,
      logPayload: (primary?.payload ?? {}) as Record<string, unknown>,
    };
  } catch (err) {
    return { ok: false, errorKey: mapEngineThrow(err) };
  }
}

/**
 * Thin adapter over authoritative `applyAction` for tests and tools that use
 * legacy `applyGameAction`.
 */
export function applyGameAction(
  state: EngineGameState,
  action: GameAction,
  ctx: ApplyGameActionContext,
): ApplyGameActionResult {
  return applyViaAuthoritativeStateMachine(state, action, ctx);
}
