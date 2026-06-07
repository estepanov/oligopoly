import {
  LeaderboardCompletionsEntrySchema,
  LeaderboardCompletionsResponseSchema,
  LeaderboardErrorKeys,
  type LeaderboardSummary,
  LeaderboardWinsEntrySchema,
  LeaderboardWinsResponseSchema,
} from "@oligopoly/validation";
import { Hono } from "hono";
import type { z } from "zod";
import { safeParseJsonArrayElements } from "../lib/jsonParse";
import {
  EMPTY_LEADERBOARD_SUMMARY,
  parseLeaderboardSummaryFromKv,
} from "../lib/leaderboardKv";

type Bindings = {
  KV?: KVNamespace;
};

export const leaderboardRoutes = new Hono<{ Bindings: Bindings }>();

async function readLeaderboardSummary(
  kv: KVNamespace,
): Promise<LeaderboardSummary> {
  const raw = await kv.get("leaderboard:summary");
  return parseLeaderboardSummaryFromKv(raw);
}

type Summary = LeaderboardSummary;

async function readFilteredLeaderboardPayload<T extends { userId: string }>(
  kv: KVNamespace,
  entriesKey: "leaderboard:wins" | "leaderboard:completions",
  elementSchema: z.ZodType<T>,
): Promise<{ entries: T[]; summary: Summary }> {
  const raw = await kv.get(entriesKey);
  const summary = await readLeaderboardSummary(kv);
  if (!raw) {
    return { entries: [], summary };
  }

  const entries = safeParseJsonArrayElements(raw, elementSchema).filter(
    (entry) => !entry.userId.startsWith("ai:"),
  );

  return { entries, summary };
}

// GET /wins — Return leaderboard ranked by wins
leaderboardRoutes.get("/wins", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    const empty = LeaderboardWinsResponseSchema.safeParse({
      entries: [],
      summary: EMPTY_LEADERBOARD_SUMMARY,
    });
    if (!empty.success) {
      return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
    }
    return c.json(empty.data);
  }

  const payload = await readFilteredLeaderboardPayload(
    kv,
    "leaderboard:wins",
    LeaderboardWinsEntrySchema,
  );

  const validated = LeaderboardWinsResponseSchema.safeParse({
    entries: payload.entries,
    summary: payload.summary,
  });
  if (!validated.success) {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }
  return c.json(validated.data);
});

// GET /completions — Return leaderboard ranked by completions
leaderboardRoutes.get("/completions", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    const empty = LeaderboardCompletionsResponseSchema.safeParse({
      entries: [],
      summary: EMPTY_LEADERBOARD_SUMMARY,
    });
    if (!empty.success) {
      return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
    }
    return c.json(empty.data);
  }

  const payload = await readFilteredLeaderboardPayload(
    kv,
    "leaderboard:completions",
    LeaderboardCompletionsEntrySchema,
  );

  const validated = LeaderboardCompletionsResponseSchema.safeParse({
    entries: payload.entries,
    summary: payload.summary,
  });
  if (!validated.success) {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }
  return c.json(validated.data);
});
