import { describe, expect, it } from "vitest";
import {
  authoritativeRollDice,
  buildEngineActionInput,
  withPathChoiceDie,
} from "../../packages/worker/src/lib/dice";

const inRange = (d: number) => Number.isInteger(d) && d >= 1 && d <= 6;

describe("authoritativeRollDice", () => {
  it("honors a client-supplied result only on loopback origins", () => {
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
    expect(everDiffered).toBe(true);
  });

  it("uses server RNG when no client result is provided", () => {
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

describe("buildEngineActionInput", () => {
  it("enriches roll_dice with dice + path-choice die", () => {
    const out = buildEngineActionInput(
      { type: "roll_dice" },
      "http://localhost/api/x",
    ) as { result: [number, number]; pathChoiceDie: number };
    expect(inRange(out.result[0])).toBe(true);
    expect(inRange(out.result[1])).toBe(true);
    expect(inRange(out.pathChoiceDie)).toBe(true);
  });

  it("passes non-roll actions through unchanged", () => {
    const action = { type: "end_turn" } as const;
    expect(buildEngineActionInput(action, "http://localhost/api/x")).toEqual(
      action,
    );
  });
});

describe("withPathChoiceDie", () => {
  it("adds only path-choice dice to AI roll actions", () => {
    const out = withPathChoiceDie({ type: "roll_dice", result: [2, 5] }) as {
      result: [number, number];
      pathChoiceDie: number;
    };

    expect(out.result).toEqual([2, 5]);
    expect(inRange(out.pathChoiceDie)).toBe(true);
  });

  it("passes non-roll actions through unchanged", () => {
    const action = { type: "end_turn" } as const;
    expect(withPathChoiceDie(action)).toEqual(action);
  });
});
