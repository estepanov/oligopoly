import { describe, it, expect } from "vitest";
import app from "@oligopoly/worker";

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
  it("returns 501 for auth endpoints", async () => {
    const res = await app.request("/api/auth/login", { method: "POST" });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toContain("not configured");
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/api/nonexistent");
    expect(res.status).toBe(404);
  });
});
