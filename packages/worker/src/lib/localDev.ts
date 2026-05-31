import { isLoopbackHostname } from "@oligopoly/shared";

/**
 * True when a request targets a loopback origin. Used to gate local-only routes
 * (dev-login, AI step) and — via `authoritativeRollDice` in `./dice.ts` — to
 * decide whether a client-supplied dice `result` may be honored for
 * deterministic tests. Delegates to the shared `isLoopbackHostname` so the web
 * dev-login gate uses the exact same rule.
 */
export function isLocalDevRequest(url: string): boolean {
  return isLoopbackHostname(new URL(url).hostname);
}
