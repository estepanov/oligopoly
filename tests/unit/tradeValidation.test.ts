import {
  GameActionSchema,
  TradeErrorKeys,
  TradeOfferSchema,
} from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

describe("GameActionSchema (trade actions)", () => {
  it("accepts trade offer actions", () => {
    expect(
      GameActionSchema.safeParse({
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 100, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [6] },
        timeoutMinutes: 5,
      }).success,
    ).toBe(true);
    expect(
      GameActionSchema.safeParse({
        type: "accept_trade",
        offerId: "trade-1",
      }).success,
    ).toBe(true);
    expect(
      GameActionSchema.safeParse({
        type: "reject_trade",
        offerId: "trade-1",
      }).success,
    ).toBe(true);
    expect(
      GameActionSchema.safeParse({
        type: "counter_trade",
        offerId: "trade-1",
        gives: { capital: 0, tilePositions: [6] },
        receives: { capital: 100, tilePositions: [] },
      }).success,
    ).toBe(true);
  });
});

describe("TradeOfferSchema", () => {
  it("accepts a pending trade offer", () => {
    const result = TradeOfferSchema.safeParse({
      id: "trade-1",
      gameId: "game-1",
      proposerId: "p1",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3] },
      receives: { capital: 50, tilePositions: [6] },
      status: "pending",
      createdAt: 1,
      expiresAt: 2,
      counterCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("exports stable trade error keys", () => {
    expect(TradeErrorKeys.OFFER_EXPIRED).toBe("trade.offer_expired");
    expect(TradeErrorKeys).toEqual({
      OFFER_NOT_FOUND: "trade.offer_not_found",
      OFFER_NOT_PENDING: "trade.offer_not_pending",
      OFFER_EXPIRED: "trade.offer_expired",
      INVALID_PARTY: "trade.invalid_party",
      INVALID_TERMS: "trade.invalid_terms",
      TILE_NOT_OWNED: "trade.tile_not_owned",
      TILE_MORTGAGED: "trade.tile_mortgaged",
      INSUFFICIENT_CAPITAL: "trade.insufficient_capital",
      COUNTER_LIMIT_REACHED: "trade.counter_limit_reached",
    });
  });

  // ADV-4: tilePositions must be bounded to prevent unbounded-array DoS.
  it("rejects trade transfers with too many tile positions", () => {
    const oversized = Array.from({ length: 41 }, (_, index) => index);
    expect(
      GameActionSchema.safeParse({
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 0, tilePositions: oversized },
        receives: { capital: 50, tilePositions: [] },
      }).success,
    ).toBe(false);
    expect(
      GameActionSchema.safeParse({
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 0, tilePositions: oversized.slice(0, 40) },
        receives: { capital: 50, tilePositions: [] },
      }).success,
    ).toBe(true);
  });

  // Defense in depth: the engine caps counter chains at MAX_TRADE_COUNTERS (2),
  // so a crafted payload must never carry a higher counterCount.
  it("rejects a counterCount above MAX_TRADE_COUNTERS", () => {
    const base = {
      id: "trade-1",
      gameId: "game-1",
      proposerId: "p1",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3] },
      receives: { capital: 50, tilePositions: [6] },
      status: "pending" as const,
      createdAt: 1,
      expiresAt: 2,
    };
    expect(
      TradeOfferSchema.safeParse({ ...base, counterCount: 2 }).success,
    ).toBe(true);
    expect(
      TradeOfferSchema.safeParse({ ...base, counterCount: 999 }).success,
    ).toBe(false);
    expect(
      TradeOfferSchema.safeParse({ ...base, counterCount: 3 }).success,
    ).toBe(false);
  });
});
