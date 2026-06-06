import {
  LeaderboardCompletionsResponseSchema,
  LeaderboardErrorKeys,
  LeaderboardSummarySchema,
  LeaderboardWinsResponseSchema,
} from "@oligopoly/validation";
import { Hono } from "hono";

type Bindings = {
  KV?: KVNamespace;
};

export const leaderboardRoutes = new Hono<{ Bindings: Bindings }>();

const EMPTY_SUMMARY = { humanWins: 0, aiWins: 0 };

async function readLeaderboardSummary(kv: KVNamespace) {
  const raw = await kv.get("leaderboard:summary");
  if (!raw) return EMPTY_SUMMARY;
  const parsed = JSON.parse(raw);
  return LeaderboardSummarySchema.parse(parsed);
}

function isAiLeaderboardEntry(entry: unknown): boolean {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { userId?: unknown }).userId === "string" &&
    (entry as { userId: string }).userId.startsWith("ai:")
  );
}

// GET /wins — Return leaderboard ranked by wins
leaderboardRoutes.get("/wins", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    return c.json({ entries: [], summary: EMPTY_SUMMARY });
  }

  const raw = await kv.get("leaderboard:wins");
  if (!raw) {
    try {
      const summary = await readLeaderboardSummary(kv);
      return c.json({ entries: [], summary });
    } catch {
      return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
    }
  }

  let parsed: unknown;
  let summary = EMPTY_SUMMARY;
  try {
    parsed = JSON.parse(raw);
    summary = await readLeaderboardSummary(kv);
  } catch {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  const result = LeaderboardWinsResponseSchema.safeParse({
    entries: Array.isArray(parsed)
      ? parsed.filter((entry) => !isAiLeaderboardEntry(entry))
      : parsed,
    summary,
  });
  if (!result.success) {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  return c.json(result.data);
});

// GET /completions — Return leaderboard ranked by completions
leaderboardRoutes.get("/completions", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    return c.json({ entries: [], summary: EMPTY_SUMMARY });
  }

  const raw = await kv.get("leaderboard:completions");
  if (!raw) {
    try {
      const summary = await readLeaderboardSummary(kv);
      return c.json({ entries: [], summary });
    } catch {
      return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
    }
  }

  let parsed: unknown;
  let summary = EMPTY_SUMMARY;
  try {
    parsed = JSON.parse(raw);
    summary = await readLeaderboardSummary(kv);
  } catch {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  const result = LeaderboardCompletionsResponseSchema.safeParse({
    entries: Array.isArray(parsed)
      ? parsed.filter((entry) => !isAiLeaderboardEntry(entry))
      : parsed,
    summary,
  });
  if (!result.success) {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  return c.json(result.data);
});
