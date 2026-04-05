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

  it("returns full board configuration", async () => {
    const res = await app.request("/api/game-config");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Board tiles
    expect(body.perimeterTiles).toHaveLength(40);
    expect(body.diagonalTiles).toHaveLength(5);
    expect(body.perimeterTiles[0].name).toBe("START");
    expect(body.diagonalTiles[0].name).toBe("Offshore Capital Corp.");

    // Sectors
    expect(Object.keys(body.sectors)).toHaveLength(8);
    expect(body.sectors.emerging_tech.name).toBe("Emerging Tech");

    // Total market value
    expect(body.totalBoardMarketValue).toBeGreaterThan(0);
  });

  it("returns all card decks and registries", async () => {
    const res = await app.request("/api/game-config");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Standard market event deck (30 cards)
    expect(Object.keys(body.marketEventDeck)).toHaveLength(30);
    expect(body.marketEventDeck.tech_boom).toBeDefined();
    expect(body.marketEventDeck.tech_boom.category).toBe("positive");

    // Disruption deck (15 cards)
    expect(Object.keys(body.disruptionDeck)).toHaveLength(15);
    expect(body.disruptionDeck.disruption_patent_troll).toBeDefined();

    // Affinity cards (12 cards)
    expect(Object.keys(body.affinityCards)).toHaveLength(12);
    expect(body.affinityCards.ai_pioneer).toBeDefined();

    // Rank thresholds (5 tiers)
    expect(body.rankThresholds).toHaveLength(5);
    expect(body.rankThresholds[0].title).toBe("Market Novice");

    // Achievements (15)
    expect(Object.keys(body.achievements)).toHaveLength(15);

    // Optional rules (10)
    expect(Object.keys(body.optionalRules)).toHaveLength(10);

    // Optional market event cards (11)
    expect(Object.keys(body.optionalMarketEventCards)).toHaveLength(11);
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
