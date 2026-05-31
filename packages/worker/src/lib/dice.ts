import {
  isLoopbackUrl,
  rollFairDice,
  rollPathChoiceDie,
} from "@oligopoly/shared";
import type { GameAction } from "@oligopoly/validation";

/**
 * Resolve the dice for a `roll_dice` action submitted over the public HTTP
 * route. This is a PRODUCTION security boundary: real (deployed) players ALWAYS
 * get fresh crypto RNG and can never pick favorable rolls. A client-supplied
 * `result` is honored only on loopback origins so deterministic integration
 * tests can drive specific dice. (The AI runtime supplies its own dice via the
 * engine directly and does not go through this path.)
 */
export function authoritativeRollDice(
  requestUrl: string,
  clientResult: [number, number] | undefined,
): [number, number] {
  if (clientResult && isLoopbackUrl(requestUrl)) {
    return clientResult;
  }
  return rollFairDice();
}

/**
 * Inject the server-generated path-choice die for rolls that may pass through
 * START. Shared by the HTTP route enrichment and the AI runtime — the AI
 * supplies its own dice `result` and must NOT go through `authoritativeRollDice`,
 * so path-choice injection is factored out here to avoid drift.
 */
export function withPathChoiceDie(action: GameAction) {
  if (action.type !== "roll_dice") {
    return action;
  }
  return { ...action, pathChoiceDie: rollPathChoiceDie() };
}

/**
 * Enrich a parsed client action with the server-authoritative fields the engine
 * needs before `applyAction`. Keeps the route handler a clean
 * parse → enrich → apply → persist pipeline and keeps the dice-authority logic
 * in one place. Only `roll_dice` needs enrichment today.
 */
export function buildEngineActionInput(action: GameAction, requestUrl: string) {
  if (action.type !== "roll_dice") {
    return action;
  }
  return {
    ...withPathChoiceDie(action),
    result: authoritativeRollDice(requestUrl, action.result),
  };
}
