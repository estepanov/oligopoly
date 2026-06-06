import {
  PLAYER_STATE_CHANGE_FIELD_KEYS,
  type PlayerStateChangeFieldKey,
  type PlayerStateChangesBody,
  PlayerStateChangesBodySchema,
} from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

const minimalBodies: {
  [K in PlayerStateChangeFieldKey]: PlayerStateChangesBody;
} = {
  capital: { capital: { before: 0, after: 1, delta: 1 } },
  position: { position: { before: 0, after: 1 } },
  actionPointsRemaining: {
    actionPointsRemaining: { before: 2, after: 0, delta: -2 },
  },
  trustworthiness: {
    trustworthiness: { before: 5, after: 6, delta: 1 },
  },
  inRegulation: { inRegulation: { before: false, after: true } },
  syndicateId: { syndicateId: { before: null, after: "synd-1" } },
  outstandingDebt: {
    outstandingDebt: { before: 10, after: 0, delta: -10 },
  },
  ownedTilePositions: {
    ownedTilePositions: { added: ["1"], removed: [] },
  },
  mortgagedTilePositions: {
    mortgagedTilePositions: { added: [], removed: ["2"] },
  },
  developmentTokens: {
    developmentTokens: [{ position: 3, before: 0, after: 1 }],
  },
};

describe("player_state_changed contract", () => {
  it("PLAYER_STATE_CHANGE_FIELD_KEYS matches PlayerStateChangesBodySchema shape keys", () => {
    expect([...PLAYER_STATE_CHANGE_FIELD_KEYS].sort()).toEqual(
      Object.keys(PlayerStateChangesBodySchema.shape).sort(),
    );
  });

  it("rejects bodies that mix a known field with unknown keys", () => {
    const parsed = PlayerStateChangesBodySchema.safeParse({
      capital: { before: 0, after: 1, delta: 1 },
      notInRegistry: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("each PLAYER_STATE_CHANGE_FIELD_KEYS field parses with PlayerStateChangesBodySchema", () => {
    for (const key of PLAYER_STATE_CHANGE_FIELD_KEYS) {
      const parsed = PlayerStateChangesBodySchema.safeParse(minimalBodies[key]);
      expect(parsed.success, `schema rejects field ${key}`).toBe(true);
    }
  });
});
