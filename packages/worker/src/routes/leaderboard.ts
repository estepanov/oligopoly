import {
  LeaderboardCompletionsResponseSchema,
  LeaderboardErrorKeys,
  LeaderboardWinsResponseSchema,
} from "@oligopoly/validation";
import { Hono } from "hono";

type Bindings = {
  KV?: KVNamespace;
};

export const leaderboardRoutes = new Hono<{ Bindings: Bindings }>();

// GET /wins — Return leaderboard ranked by wins
leaderboardRoutes.get("/wins", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    return c.json({ entries: [] });
  }

  const raw = await kv.get("leaderboard:wins");
  if (!raw) {
    return c.json({ entries: [] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  const result = LeaderboardWinsResponseSchema.safeParse({ entries: parsed });
  if (!result.success) {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  return c.json(result.data);
});

// GET /completions — Return leaderboard ranked by completions
leaderboardRoutes.get("/completions", async (c) => {
  const kv = c.env?.KV;
  if (!kv) {
    return c.json({ entries: [] });
  }

  const raw = await kv.get("leaderboard:completions");
  if (!raw) {
    return c.json({ entries: [] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  const result = LeaderboardCompletionsResponseSchema.safeParse({
    entries: parsed,
  });
  if (!result.success) {
    return c.json({ error: LeaderboardErrorKeys.INVALID_DATA }, 500);
  }

  return c.json(result.data);
});
