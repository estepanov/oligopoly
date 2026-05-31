import { rollFairDice } from "@oligopoly/shared";

/**
 * True when a request targets a local development origin (localhost / 127.0.0.1
 * / IPv6 loopback). Used to gate local-only routes (dev-login, AI step) and to
 * decide whether client-supplied dice may be honored for deterministic tests.
 *
 * Single source of truth so tunnel hosts / future dev origins change in one
 * place.
 */
export function isLocalDevRequest(url: string): boolean {
  // URL.hostname returns IPv6 literals wrapped in brackets (e.g. "[::1]").
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
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
