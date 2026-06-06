import app from "@oligopoly/worker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(body).toEqual({ entries: [], summary: { humanWins: 0, aiWins: 0 } });
  });

  it("returns empty entries array when KV key is not set", async () => {
    const kv = createKvStub();
    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: [], summary: { humanWins: 0, aiWins: 0 } });
  });

  it("falls back summary to zeros when leaderboard:summary is invalid JSON", async () => {
    const kv = createKvStub();
    await kv.put("leaderboard:wins", JSON.stringify([]));
    await kv.put("leaderboard:summary", "not-json");
    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.summary).toEqual({ humanWins: 0, aiWins: 0 });
  });

  it("falls back summary to zeros when leaderboard:summary fails schema", async () => {
    const kv = createKvStub();
    await kv.put("leaderboard:wins", JSON.stringify([]));
    await kv.put("leaderboard:summary", JSON.stringify({ unexpected: true }));
    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual({ humanWins: 0, aiWins: 0 });
  });

  it("returns entries from KV when populated", async () => {
    const kv = createKvStub();
    const entries = [
      { userId: "user-1", username: "Alice", wins: 10 },
      { userId: "ai:lobby:slot", username: "Copper Scout", wins: 8 },
      { userId: "user-2", username: "Bob", wins: 7 },
    ];
    await kv.put("leaderboard:wins", JSON.stringify(entries));
    await kv.put(
      "leaderboard:summary",
      JSON.stringify({ humanWins: 17, aiWins: 8 }),
    );

    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].userId).toBe("user-1");
    expect(body.entries[0].username).toBe("Alice");
    expect(body.entries[0].wins).toBe(10);
    expect(body.entries[1].userId).toBe("user-2");
    expect(body.entries[1].wins).toBe(7);
    expect(body.summary).toEqual({ humanWins: 17, aiWins: 8 });
  });

  it("returns 500 with typed error when KV value is malformed JSON", async () => {
    const kv = createKvStub();
    await kv.put("leaderboard:wins", "this is not json{{{");

    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("leaderboard.invalid_data");
  });

  it("returns 500 with typed error when KV value has wrong shape", async () => {
    const kv = createKvStub();
    // Array of objects missing required fields
    await kv.put(
      "leaderboard:wins",
      JSON.stringify([{ userId: "u1", wins: "not-a-number" }]),
    );

    const res = await requestWithEnv("/api/leaderboard/wins", { kv });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("leaderboard.invalid_data");
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
    expect(body).toEqual({ entries: [], summary: { humanWins: 0, aiWins: 0 } });
  });

  it("returns empty entries array when KV key is not set", async () => {
    const kv = createKvStub();
    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: [], summary: { humanWins: 0, aiWins: 0 } });
  });

  it("falls back summary to zeros when leaderboard:summary is invalid JSON", async () => {
    const kv = createKvStub();
    await kv.put("leaderboard:completions", JSON.stringify([]));
    await kv.put("leaderboard:summary", "not-json");
    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.summary).toEqual({ humanWins: 0, aiWins: 0 });
  });

  it("falls back summary to zeros when leaderboard:summary fails schema", async () => {
    const kv = createKvStub();
    await kv.put("leaderboard:completions", JSON.stringify([]));
    await kv.put("leaderboard:summary", JSON.stringify({ unexpected: true }));
    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual({ humanWins: 0, aiWins: 0 });
  });

  it("returns entries from KV when populated", async () => {
    const kv = createKvStub();
    const entries = [
      { userId: "user-3", username: "Carol", completions: 25 },
      { userId: "ai:lobby:slot", username: "Copper Scout", completions: 20 },
      { userId: "user-4", username: "Dave", completions: 18 },
    ];
    await kv.put("leaderboard:completions", JSON.stringify(entries));
    await kv.put(
      "leaderboard:summary",
      JSON.stringify({ humanWins: 3, aiWins: 2 }),
    );

    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].userId).toBe("user-3");
    expect(body.entries[0].username).toBe("Carol");
    expect(body.entries[0].completions).toBe(25);
    expect(body.entries[1].completions).toBe(18);
    expect(body.summary).toEqual({ humanWins: 3, aiWins: 2 });
  });

  it("returns 500 with typed error when KV value is malformed JSON", async () => {
    const kv = createKvStub();
    await kv.put("leaderboard:completions", "<<<bad json>>>");

    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("leaderboard.invalid_data");
  });

  it("returns 500 with typed error when KV value has wrong shape", async () => {
    const kv = createKvStub();
    await kv.put(
      "leaderboard:completions",
      JSON.stringify([{ userId: "u1", completions: "oops" }]),
    );

    const res = await requestWithEnv("/api/leaderboard/completions", { kv });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("leaderboard.invalid_data");
  });
});

// ---------------------------------------------------------------------------
// Calls token
// ---------------------------------------------------------------------------

describe("POST /api/calls/token", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 without auth", async () => {
    const res = await requestWithEnv("/api/calls/token", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("calls.auth_required");
  });

  it("returns 501 when CF_CALLS_APP_ID and CF_CALLS_APP_SECRET are absent", async () => {
    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("calls.not_configured");
  });

  it("returns 501 when only CF_CALLS_APP_ID is set", async () => {
    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppId: "test-app-id",
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("calls.not_configured");
  });

  it("returns 501 when only CF_CALLS_APP_SECRET is set", async () => {
    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppSecret: "test-secret",
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("calls.not_configured");
  });

  it("returns 502 when Cloudflare Calls API returns a non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );

    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppId: "my-app-id",
      callsAppSecret: "my-secret",
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("calls.token_failed");
  });

  it("returns 502 when Cloudflare Calls API fetch throws (network error)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network failure"));

    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppId: "my-app-id",
      callsAppSecret: "my-secret",
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("calls.token_failed");
  });

  it("returns 502 when Cloudflare response body has unexpected shape", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: "shape" }), { status: 200 }),
    );

    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppId: "my-app-id",
      callsAppSecret: "my-secret",
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("calls.upstream_invalid");
  });

  it("returns 200 with sessionId and sessionToken on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: "sess-abc-123",
          sessionToken: "tok-xyz-456",
        }),
        { status: 200 },
      ),
    );

    const res = await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppId: "my-app-id",
      callsAppSecret: "my-secret",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe("sess-abc-123");
    expect(body.sessionToken).toBe("tok-xyz-456");
  });

  it("uses encodeURIComponent on the app ID in the upstream URL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "s", sessionToken: "t" }), {
        status: 200,
      }),
    );

    await requestWithEnv("/api/calls/token", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      callsAppId: "app/id with spaces",
      callsAppSecret: "secret",
    });

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain("app%2Fid%20with%20spaces");
    expect(calledUrl).not.toContain("app/id with spaces");
  });
});
