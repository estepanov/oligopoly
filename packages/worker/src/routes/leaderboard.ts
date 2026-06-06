import {
  LeaderboardCompletionsResponseSchema,
  LeaderboardErrorKeys,
  type LeaderboardSummary,
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

type Summary = LeaderboardSummary;

async function readFilteredLeaderboardPayload(
  kv: KVNamespace,
  entriesKey: "leaderboard:wins" | "leaderboard:completions",
): Promise<
  | { ok: true; entries: unknown[]; summary: Summary }
  | {
      ok: false;
      error: (typeof LeaderboardErrorKeys)[keyof typeof LeaderboardErrorKeys];
    }
> {
  const raw = await kv.get(entriesKey);
  if (!raw) {
    try {
      const summary = await readLeaderboardSummary(kv);
      return { ok: true, entries: [], summary };
    } catch {
      return { ok: false, error: LeaderboardErrorKeys.INVALID_DATA };
    }
  }

  let parsed: unknown;
  let summary = EMPTY_SUMMARY;
  try {
    parsed = JSON.parse(raw);
    summary = await readLeaderboardSummary(kv);
  } catch {
    return { ok: false, error: LeaderboardErrorKeys.INVALID_DATA };
  }

  const entries: unknown[] = Array.isArray(parsed)
    ? parsed.filter((entry) => !isAiLeaderboardEntry(entry))
    : [];

  return { ok: true, entries, summary };
}

// GET /wins — Return leaderboard ranked by wins
leaderboardRoutes.get("/wins", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    return c.json({ entries: [], summary: EMPTY_SUMMARY });
  }

  const payload = await readFilteredLeaderboardPayload(kv, "leaderboard:wins");
  if (!payload.ok) {
    return c.json({ error: payload.error }, 500);
  }

  const result = LeaderboardWinsResponseSchema.safeParse({
    entries: payload.entries,
    summary: payload.summary,
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

  const payload = await readFilteredLeaderboardPayload(
    kv,
    "leaderboard:completions",
  );
  if (!payload.ok) {
    return c.json({ error: payload.error }, 500);
  }

  const result = LeaderboardCompletionsResponseSchema.safeParse({
    entries: payload.entries,
    summary: payload.summary,
  });
  if (!result.success) {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  return c.json(result.data);
});
