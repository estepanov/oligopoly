import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

type KvGet = (key: string) => Promise<string | null>;

const createRequestWithEnv = (
  path: string,
  options: {
    method?: string;
    headers?: HeadersInit;
    kvGet?: KvGet;
    db?: D1Database;
  } = {},
) => {
  const { method, headers, kvGet, db } = options;
  return app.request(
    path,
    {
      method,
      headers,
    },
    {
      ALLOWED_ORIGINS: "http://localhost:5173",
      DB: db,
      KV: kvGet ? ({ get: kvGet } as KVNamespace) : undefined,
    },
  );
};

describe("rateLimitMiddleware", () => {
  it("returns 429 when auth IP key is flagged", async () => {
    const res = await createRequestWithEnv("/api/auth/login", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "203.0.113.2",
      },
      kvGet: async (key) => (key === "ratelimit:auth:203.0.113.2" ? "1" : null),
    });

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "rate_limit_exceeded" });
  });

  it("returns 429 when read subject key is flagged", async () => {
    const res = await createRequestWithEnv("/api/game-config", {
      method: "GET",
      headers: {
        "x-subject": "user-123",
      },
      kvGet: async (key) => (key === "ratelimit:read:user-123" ? "1" : null),
    });

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "rate_limit_exceeded" });
  });

  it("passes through when no limiting key exists", async () => {
    const res = await createRequestWithEnv("/api/game-config", {
      method: "GET",
      headers: {
        "x-subject": "user-456",
      },
      kvGet: async () => null,
    });

    expect(res.status).toBe(200);
  });
});

describe("banCacheMiddleware", () => {
  it("resolves websocket access_token before ban checks", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ user_id: "user-banned", role: "user" }),
        }),
      }),
    } as unknown as D1Database;

    const res = await createRequestWithEnv(
      "/api/game-config?access_token=ws-token",
      {
        headers: { Upgrade: "websocket" },
        db,
        kvGet: async (key) => (key === "ban:user-banned" ? "1" : null),
      },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "account_banned" });
  });

  it("returns 403 when ban key is flagged", async () => {
    const res = await createRequestWithEnv("/api/game-config", {
      method: "GET",
      headers: {
        "x-subject": "user-banned",
      },
      kvGet: async (key) => (key === "ban:user-banned" ? "1" : null),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "account_banned" });
  });

  it("checks rate limit before ban cache", async () => {
    const res = await createRequestWithEnv("/api/game-config", {
      method: "GET",
      headers: {
        "x-subject": "user-priority-check",
      },
      kvGet: async (key) => {
        if (key === "ratelimit:read:user-priority-check") {
          return "1";
        }
        if (key === "ban:user-priority-check") {
          return "1";
        }
        return null;
      },
    });

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "rate_limit_exceeded" });
  });
});
