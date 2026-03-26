import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

type KvGet = (key: string) => Promise<string | null>;

const createRequestWithEnv = (
  path: string,
  options: {
    method?: string;
    headers?: HeadersInit;
    kvGet?: KvGet;
  } = {},
) => {
  const { method, headers, kvGet } = options;
  return app.request(
    path,
    {
      method,
      headers,
    },
    {
      ALLOWED_ORIGINS: "http://localhost:5173",
      KV: kvGet ? ({ get: kvGet } as KVNamespace) : undefined,
    },
  );
};

describe("banCacheMiddleware", () => {
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

  it("passes through when no ban key exists", async () => {
    const res = await createRequestWithEnv("/api/game-config", {
      method: "GET",
      headers: {
        "x-subject": "user-ok",
      },
      kvGet: async () => null,
    });

    expect(res.status).toBe(200);
  });

  it("passes through when subject is missing", async () => {
    const res = await createRequestWithEnv("/api/game-config", {
      method: "GET",
      kvGet: async () => "1",
    });

    expect(res.status).toBe(200);
  });
});
