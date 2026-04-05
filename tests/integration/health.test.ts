import app from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("oligopoly-worker");
    expect(typeof body.timestamp).toBe("number");
  });
});

describe("GET /api/game-config", () => {
  it("returns game configuration", async () => {
    const res = await app.request("/api/game-config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appName).toBe("Oligopoly Online");
    expect(body.maxPlayers).toBe(6);
    expect(body.boardSize).toBe(40);
  });
});

describe("ALL /api/auth/*", () => {
  it("returns error for auth endpoints without DB/KV", async () => {
    const res = await app.request("/api/auth/login/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("not_configured");
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/api/nonexistent");
    expect(res.status).toBe(404);
  });
});
