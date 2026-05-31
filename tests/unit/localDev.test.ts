import { describe, expect, it } from "vitest";
import {
  authoritativeRollDice,
  isLocalDevRequest,
} from "../../packages/worker/src/lib/localDev";

describe("isLocalDevRequest", () => {
  it("recognizes loopback hosts", () => {
    expect(isLocalDevRequest("http://localhost:8787/api/x")).toBe(true);
    expect(isLocalDevRequest("http://127.0.0.1/api/x")).toBe(true);
    expect(isLocalDevRequest("http://[::1]:8787/api/x")).toBe(true);
  });

  it("rejects deployed hosts", () => {
    expect(isLocalDevRequest("https://oligopoly.online/api/x")).toBe(false);
    expect(isLocalDevRequest("https://evil.example/api/x")).toBe(false);
  });
});

describe("authoritativeRollDice", () => {
  const inRange = (d: number) => Number.isInteger(d) && d >= 1 && d <= 6;

  it("honors a client-supplied result only on local/test origins", () => {
    expect(authoritativeRollDice("http://localhost/api/x", [3, 4])).toEqual([
      3, 4,
    ]);
    expect(authoritativeRollDice("http://127.0.0.1/api/x", [6, 6])).toEqual([
      6, 6,
    ]);
  });

  it("ignores client dice on deployed origins and uses server RNG", () => {
    let everDiffered = false;
    for (let i = 0; i < 200; i++) {
      const [d1, d2] = authoritativeRollDice(
        "https://oligopoly.online/api/x",
        [6, 6],
      );
      expect(inRange(d1)).toBe(true);
      expect(inRange(d2)).toBe(true);
      if (d1 !== 6 || d2 !== 6) everDiffered = true;
    }
    // Astronomically unlikely (~ (1/36)^200) to be all 6,6 if RNG is used.
    expect(everDiffered).toBe(true);
  });

  it("uses server RNG when no client result is provided (even locally)", () => {
    for (let i = 0; i < 50; i++) {
      const [d1, d2] = authoritativeRollDice(
        "http://localhost/api/x",
        undefined,
      );
      expect(inRange(d1)).toBe(true);
      expect(inRange(d2)).toBe(true);
    }
  });
});
