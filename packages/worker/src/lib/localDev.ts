import { isLoopbackHostname, rollFairDice } from "@oligopoly/shared";

/**
 * True when a request targets a loopback origin. Used to gate local-only routes
 * (dev-login, AI step) and to decide whether a client-supplied dice `result`
 * may be honored for deterministic tests. Delegates to the shared
 * `isLoopbackHostname` so the web dev-login gate uses the exact same rule.
 */
export function isLocalDevRequest(url: string): boolean {
  return isLoopbackHostname(new URL(url).hostname);
}

/**
 * Resolve the dice for a `roll_dice` action submitted over the public HTTP
 * route. The server is authoritative: real (deployed) players ALWAYS get fresh
 * crypto RNG and cannot pick favorable rolls. A client-supplied `result` is
 * honored only on local/test origins so deterministic integration tests can
 * still drive specific dice. The AI runtime supplies its own dice via the
 * engine directly and does not go through this path.
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
