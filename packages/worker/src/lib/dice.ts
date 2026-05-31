import { rollFairDice } from "@oligopoly/shared";
import { isLocalDevRequest } from "./localDev.js";

/**
 * Resolve the dice for a `roll_dice` action submitted over the public HTTP
 * route. This is a PRODUCTION security boundary: real (deployed) players ALWAYS
 * get fresh crypto RNG and can never pick favorable rolls. A client-supplied
 * `result` is honored only on loopback origins so deterministic integration
 * tests can drive specific dice. (The AI runtime supplies its own dice via the
 * engine directly and does not go through this path.)
 */
export function authoritativeRollDice(
  url: string,
  clientResult: [number, number] | undefined,
): [number, number] {
  if (clientResult && isLocalDevRequest(url)) {
    return clientResult;
  }
  return rollFairDice();
}
