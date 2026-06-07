import type { RecentGameSummary } from "@oligopoly/shared";
import { RecentGameSummarySchema } from "@oligopoly/validation";
import { safeParseJsonArray, safeParseJsonArrayElements } from "./jsonParse";

/**
 * Lenient idempotency probe: parse JSON as an array and look for an object
 * whose `gameId` equals `gameId`. Does not require full
 * {@link RecentGameSummarySchema} validity so one corrupt history row cannot
 * hide an already-recorded game and cause a double completion apply.
 */
export function recentGamesJsonContainsGameId(
  raw: string | null | undefined,
  gameId: string,
): boolean {
  for (const item of safeParseJsonArray(raw)) {
    if (
      typeof item === "object" &&
      item !== null &&
      "gameId" in item &&
      (item as { gameId: unknown }).gameId === gameId
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Rebuild recent-game history for persistence: keep elements that satisfy
 * {@link RecentGameSummarySchema}, drop corrupt rows, never throws.
 */
export function sanitizeRecentGamesFromStorage(
  raw: string | null | undefined,
): RecentGameSummary[] {
  return safeParseJsonArrayElements(raw, RecentGameSummarySchema);
}
