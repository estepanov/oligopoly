import { describe, expect, it } from "vitest";
import {
  recentGamesJsonContainsGameId,
  sanitizeRecentGamesFromStorage,
} from "../../packages/worker/src/lib/recentGamesJson";

describe("recentGamesJsonContainsGameId", () => {
  it("returns false for empty or invalid JSON", () => {
    expect(recentGamesJsonContainsGameId(null, "g1")).toBe(false);
    expect(recentGamesJsonContainsGameId("", "g1")).toBe(false);
    expect(recentGamesJsonContainsGameId("not-json", "g1")).toBe(false);
    expect(recentGamesJsonContainsGameId("{}", "g1")).toBe(false);
  });

  it("finds gameId even when the row is not a full RecentGameSummary", () => {
    const raw = JSON.stringify([
      { gameId: "g0", result: "won", endedAt: 1 },
      { gameId: "g1", corrupt: true },
    ]);
    expect(recentGamesJsonContainsGameId(raw, "g1")).toBe(true);
    expect(recentGamesJsonContainsGameId(raw, "missing")).toBe(false);
  });
});

describe("sanitizeRecentGamesFromStorage", () => {
  it("keeps valid rows and drops invalid ones", () => {
    const raw = JSON.stringify([
      { gameId: "a", result: "won", endedAt: 10 },
      { garbage: true },
      { gameId: "b", result: "lost", endedAt: 20 },
    ]);
    expect(sanitizeRecentGamesFromStorage(raw)).toEqual([
      { gameId: "a", result: "won", endedAt: 10 },
      { gameId: "b", result: "lost", endedAt: 20 },
    ]);
  });

  it("returns empty array on invalid top-level JSON", () => {
    expect(sanitizeRecentGamesFromStorage("not-json")).toEqual([]);
  });
});
