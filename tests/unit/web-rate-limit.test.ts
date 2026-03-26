import { createRateLimiter } from "@oligopoly/web/src/rateLimit";
import { describe, expect, it } from "vitest";

describe("createRateLimiter", () => {
  it("allows requests under the max within the window", () => {
    const limiter = createRateLimiter({
      maxRequests: 5,
      windowMs: 10_000,
      now: (() => {
        let now = 1_000;
        return () => now++;
      })(),
    });

    for (let index = 0; index < 5; index += 1) {
      expect(limiter.checkAndTrack()).toBe(false);
    }
  });

  it("blocks requests at the max within the window", () => {
    let now = 5_000;
    const limiter = createRateLimiter({
      maxRequests: 2,
      windowMs: 10_000,
      now: () => now,
    });

    expect(limiter.checkAndTrack()).toBe(false);
    expect(limiter.checkAndTrack()).toBe(false);
    expect(limiter.checkAndTrack()).toBe(true);
  });

  it("unblocks once timestamps expire past the window", () => {
    let now = 10_000;
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 100,
      now: () => now,
    });

    expect(limiter.checkAndTrack()).toBe(false);
    expect(limiter.checkAndTrack()).toBe(true);

    now = 10_500;
    expect(limiter.checkAndTrack()).toBe(false);
  });
});
