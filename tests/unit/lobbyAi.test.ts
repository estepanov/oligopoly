import { describe, expect, it } from "vitest";
import {
  assignAiSlotNames,
  buildAiPlayersFromSlots,
} from "../../packages/worker/src/services/lobbyAi.js";

describe("buildAiPlayersFromSlots", () => {
  it("assigns unique display names in a max-AI lobby", () => {
    const aiPlayers = buildAiPlayersFromSlots(
      "lobby-max-ai",
      Array.from({ length: 6 }, (_, index) => ({
        id: `slot-${index}`,
        personality: "opportunist" as const,
      })),
    );

    expect(aiPlayers).toHaveLength(6);
    expect(new Set(aiPlayers.map((player) => player.name)).size).toBe(6);
  });

  it("normalizes unnamed lobby slots and starts games from slot names", () => {
    const slots = assignAiSlotNames("lobby-stable-ai", [
      { id: "slot-1", personality: "opportunist" },
      { id: "slot-2", personality: "opportunist" },
    ]);

    expect(slots).toHaveLength(2);
    expect(slots[0].name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(new Set(slots.map((slot) => slot.name)).size).toBe(2);

    const aiPlayers = buildAiPlayersFromSlots("lobby-stable-ai", slots);

    expect(aiPlayers.map((player) => player.name)).toEqual(
      slots.map((slot) => slot.name),
    );
  });
});
