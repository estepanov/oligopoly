import {
  auctionBidWindowToMs,
  auctionExtensionWindowToMs,
  auctionSettleDelayToMs,
  computeAuctionBidDeadline,
  computeAuctionSettleDeadline,
  computeLiveAuctionExtensionDeadline,
  isAuctionBidWindowOpen,
  isAuctionSettleDelayActive,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("auctionTiming", () => {
  it("maps lobby bid windows to milliseconds", () => {
    expect(auctionBidWindowToMs("30s")).toBe(30_000);
    expect(auctionBidWindowToMs("1min")).toBe(60_000);
    expect(auctionBidWindowToMs("5min")).toBe(300_000);
  });

  it("maps lobby settle delays to milliseconds", () => {
    expect(auctionSettleDelayToMs("10s")).toBe(10_000);
    expect(auctionSettleDelayToMs("30s")).toBe(30_000);
    expect(auctionSettleDelayToMs("1min")).toBe(60_000);
  });

  it("maps lobby extension windows to milliseconds", () => {
    expect(auctionExtensionWindowToMs("10s")).toBe(10_000);
    expect(auctionExtensionWindowToMs("15s")).toBe(15_000);
    expect(auctionExtensionWindowToMs("30s")).toBe(30_000);
  });

  it("computes bid and settle deadlines from game settings", () => {
    const now = 1_700_000_000_000;
    expect(computeAuctionBidDeadline(now, { auctionBidWindow: "30s" })).toBe(
      now + 30_000,
    );
    expect(
      computeAuctionSettleDeadline(now, { auctionSettleDelay: "10s" }),
    ).toBe(now + 10_000);
    expect(
      computeLiveAuctionExtensionDeadline(now, {
        auctionExtensionWindow: "15s",
      }),
    ).toBe(now + 15_000);
  });

  it("treats missing deadlines as open windows", () => {
    expect(isAuctionBidWindowOpen(undefined, Date.now())).toBe(true);
    expect(isAuctionSettleDelayActive(undefined, Date.now())).toBe(false);
  });
});
