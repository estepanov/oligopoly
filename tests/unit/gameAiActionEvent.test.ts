import { GameRealtimeEventSchema } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

describe("game.ai_action event", () => {
  it("accepts presentation fields", () => {
    const parsed = GameRealtimeEventSchema.parse({
      type: "game.ai_action",
      sentAt: 1,
      gameId: "g1",
      aiPlayerId: "ai:bot",
      personality: "opportunist",
      action: { type: "end_turn" },
      material: false,
      reason: null,
      softTurnEnd: true,
      stateVersion: 3,
      logCursor: 12,
      summary: "ended turn",
      displayName: "Nova Blake",
    });
    expect(parsed.type).toBe("game.ai_action");
    if (parsed.type === "game.ai_action") {
      expect(parsed.softTurnEnd).toBe(true);
      expect(parsed.stateVersion).toBe(3);
    }
  });

  it("rejects a payload missing required material/stateVersion fields", () => {
    expect(() =>
      GameRealtimeEventSchema.parse({
        type: "game.ai_action",
        sentAt: 1,
        gameId: "g1",
        aiPlayerId: "ai:bot",
        personality: "opportunist",
        action: { type: "end_turn" },
        reason: null,
        // `material` and `stateVersion` intentionally omitted.
      }),
    ).toThrow();
  });
});
