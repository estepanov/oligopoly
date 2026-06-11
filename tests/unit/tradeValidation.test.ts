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
    expect(Object.keys(TradeErrorKeys)).toHaveLength(9);
  });
});
