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

export type LeaderboardCompletionKvStep = "wins" | "completions" | "summary";

function completionKvStepKey(
  gameId: string,
  step: LeaderboardCompletionKvStep,
): string {
  return `leaderboard:completion:${gameId}:${step}`;
}

export async function isLeaderboardCompletionKvStepApplied(
  kv: KVNamespace,
  gameId: string,
  step: LeaderboardCompletionKvStep,
): Promise<boolean> {
  const raw = await kv.get(completionKvStepKey(gameId, step));
  return raw === "1";
}

export async function markLeaderboardCompletionKvStepApplied(
  kv: KVNamespace,
  gameId: string,
  step: LeaderboardCompletionKvStep,
): Promise<void> {
  await kv.put(completionKvStepKey(gameId, step), "1");
}
