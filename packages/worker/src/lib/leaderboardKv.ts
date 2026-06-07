import {
  type LeaderboardSummary,
  LeaderboardSummarySchema,
} from "@oligopoly/validation";
import { safeParseJson } from "./jsonParse";

export const EMPTY_LEADERBOARD_SUMMARY: LeaderboardSummary = {
  humanWins: 0,
  aiWins: 0,
};

/** Read `leaderboard:summary` KV payload with schema-backed fallback (never throws). */
export function parseLeaderboardSummaryFromKv(
  raw: string | null | undefined,
): LeaderboardSummary {
  return safeParseJson(
    raw,
    LeaderboardSummarySchema,
    EMPTY_LEADERBOARD_SUMMARY,
  );
}
