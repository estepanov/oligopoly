import type { RecentGameSummary } from "@oligopoly/shared";
import { RecentGameSummarySchema } from "@oligopoly/validation";

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
  if (raw == null || raw === "") return false;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return false;
    for (const item of value) {
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
  } catch {
    return false;
  }
}

/**
 * Rebuild recent-game history for persistence: keep elements that satisfy
 * {@link RecentGameSummarySchema}, drop corrupt rows, never throws.
 */
export function sanitizeRecentGamesFromStorage(
  raw: string | null | undefined,
): RecentGameSummary[] {
  if (raw == null || raw === "") return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    const out: RecentGameSummary[] = [];
    for (const item of value) {
      const parsed = RecentGameSummarySchema.safeParse(item);
      if (parsed.success) {
        out.push(parsed.data);
      }
    }
    return out;
  } catch {
    return [];
  }
}
