import { rollFairDice } from "@oligopoly/shared";

/**
 * True when a request targets a loopback origin (localhost / 127.0.0.1 / `::1`).
 * Used to gate local-only routes (dev-login, AI step) and to decide whether a
 * client-supplied dice `result` may be honored for deterministic tests.
 *
 * Single source of truth for the loopback check. Intentionally loopback-only;
 * if non-loopback dev origins (e.g. tunnel hosts) ever need access, add an
 * explicit allowlist here so every caller picks it up at once.
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
