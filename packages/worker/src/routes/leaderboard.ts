import type {
  LeaderboardCompletionsEntry,
  LeaderboardWinsEntry,
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

  const entries = JSON.parse(raw) as LeaderboardWinsEntry[];
  return c.json({ entries });
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

  const entries = JSON.parse(raw) as LeaderboardCompletionsEntry[];
  return c.json({ entries });
});
