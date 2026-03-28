import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

const createKvStub = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    },
    _store: store,
  } as unknown as KVNamespace;
};

const requestWithEnv = (
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    kv?: KVNamespace;
    callsAppId?: string;
    callsAppSecret?: string;
  } = {},
) => {
  const {
    method = "GET",
    headers = {},
    body,
    kv,
    callsAppId,
    callsAppSecret,
  } = options;
  const init: RequestInit = { method, headers: { ...headers } };
  if (body) {
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
    init.body = JSON.stringify(body);
  }
  return app.request(path, init, {
    ALLOWED_ORIGINS: "http://localhost:5173",
    KV: kv,
    CF_CALLS_APP_ID: callsAppId,
    CF_CALLS_APP_SECRET: callsAppSecret,
  });
};

// ---------------------------------------------------------------------------
// Leaderboard — wins
// ---------------------------------------------------------------------------

describe("GET /api/leaderboard/wins", () => {
  it("returns empty entries array when KV is absent", async () => {
    const res = await requestWithEnv("/api/leaderboard/wins");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: [] });
  });

  it("returns empty entries array when KV key is not set", async () => {
    const kv = createKvStub();
    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: [] });
  });

  it("returns entries from KV when populated", async () => {
    const kv = createKvStub();
    const entries = [
      { userId: "user-1", username: "Alice", wins: 10 },
      { userId: "user-2", username: "Bob", wins: 7 },
    ];
    await kv.put("leaderboard:wins", JSON.stringify(entries));

    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].userId).toBe("user-1");
    expect(body.entries[0].username).toBe("Alice");
    expect(body.entries[0].wins).toBe(10);
    expect(body.entries[1].userId).toBe("user-2");
    expect(body.entries[1].wins).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Leaderboard — completions
// ---------------------------------------------------------------------------

describe("GET /api/leaderboard/completions", () => {
  it("returns empty entries array when KV is absent", async () => {
    const res = await requestWithEnv("/api/leaderboard/completions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: [] });
  });

  it("returns empty entries array when KV key is not set", async () => {
    const kv = createKvStub();
    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: [] });
  });

  it("returns entries from KV when populated", async () => {
    const kv = createKvStub();
    const entries = [
      { userId: "user-3", username: "Carol", completions: 25 },
      { userId: "user-4", username: "Dave", completions: 18 },
    ];
    await kv.put("leaderboard:completions", JSON.stringify(entries));

    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].userId).toBe("user-3");
    expect(body.entries[0].username).toBe("Carol");
    expect(body.entries[0].completions).toBe(25);
    expect(body.entries[1].completions).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// Calls token
// ---------------------------------------------------------------------------

describe("POST /api/calls/token", () => {
  it("returns 401 without auth", async () => {
    const res = await requestWithEnv("/api/calls/token", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("auth_required");
  });

  it("returns 501 when CF_CALLS_APP_ID and CF_CALLS_APP_SECRET are absent", async () => {
    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("calls_not_configured");
  });

  it("returns 501 when only CF_CALLS_APP_ID is set", async () => {
    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppId: "test-app-id",
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("calls_not_configured");
  });

  it("returns 501 when only CF_CALLS_APP_SECRET is set", async () => {
    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppSecret: "test-secret",
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("calls_not_configured");
  });
});
