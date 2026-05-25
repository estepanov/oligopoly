import {
  auctionBidWindowToMs,
  computeAuctionBidDeadline,
  isAuctionBidWindowOpen,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("auctionTiming", () => {
  it("maps lobby bid windows to milliseconds", () => {
    expect(auctionBidWindowToMs("30s")).toBe(30_000);
    expect(auctionBidWindowToMs("1min")).toBe(60_000);
    expect(auctionBidWindowToMs("5min")).toBe(300_000);
  });

  it("computes bid deadlines from game settings", () => {
    const now = 1_700_000_000_000;
    expect(computeAuctionBidDeadline(now, { auctionBidWindow: "30s" })).toBe(
      now + 30_000,
    );
  });

  it("treats missing deadlines as open windows", () => {
    expect(isAuctionBidWindowOpen(undefined, Date.now())).toBe(true);
  });
});
