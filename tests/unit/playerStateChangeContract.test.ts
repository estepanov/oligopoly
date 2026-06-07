import type { InternalGameState, InternalPlayerState } from "@oligopoly/shared";
import {
  buildPlayerStateChangesBody,
  type PlayerChangeSnapshot,
  snapshotPlayerChanges,
} from "@oligopoly/shared";
import {
  PLAYER_STATE_CHANGE_FIELD_KEYS,
  PLAYER_STATE_CHANGE_FIELD_SCHEMAS,
  type PlayerStateChangeFieldKey,
  type PlayerStateChangesBody,
  PlayerStateChangesBodySchema,
} from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import { formatGameLogEntry } from "../../packages/web/src/lib/gameLogDisplay";

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

function basePlayer(
  overrides: Partial<InternalPlayerState> = {},
): InternalPlayerState {
  return {
    playerId: "p1",
    position: 0,
    capital: 1000,
    ownedTilePositions: [],
    mortgagedTilePositions: [],
    developmentTokens: {},
    trustworthiness: 5,
    actionPointsRemaining: 2,
    inRegulation: false,
    doublesCount: 0,
    isOnDiagonal: false,
    ...overrides,
  };
}

function minimalGameState(player: InternalPlayerState): InternalGameState {
  return {
    gameId: "g1",
    phase: "action",
    round: 1,
    currentPlayerIndex: 0,
    players: [player],
    tiles: [],
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  };
}

/** After-state for each field — paired with a before snapshot that differs. */
const registryAfterPlayers: {
  [K in PlayerStateChangeFieldKey]: InternalPlayerState;
} = {
  capital: basePlayer({ capital: 1100 }),
  position: basePlayer({ position: 3 }),
  actionPointsRemaining: basePlayer({ actionPointsRemaining: 0 }),
  trustworthiness: basePlayer({ trustworthiness: 6 }),
  inRegulation: basePlayer({ inRegulation: true }),
  syndicateId: basePlayer({ syndicateId: "synd-1" }),
  outstandingDebt: basePlayer({ outstandingDebt: 50 }),
  ownedTilePositions: basePlayer({ ownedTilePositions: ["1"] }),
  mortgagedTilePositions: basePlayer({ mortgagedTilePositions: ["2"] }),
  developmentTokens: basePlayer({ developmentTokens: { "3": 1 } }),
};

describe("player_state_changed contract", () => {
  it("PLAYER_STATE_CHANGE_FIELD_KEYS matches PLAYER_STATE_CHANGE_FIELD_SCHEMAS keys", () => {
    expect([...PLAYER_STATE_CHANGE_FIELD_KEYS].sort()).toEqual(
      Object.keys(PLAYER_STATE_CHANGE_FIELD_SCHEMAS).sort(),
    );
  });

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

  it("engine registry diff output parses under PlayerStateChangesBodySchema per field", () => {
    const beforePlayer = basePlayer();
    const beforeSnapshots = snapshotPlayerChanges(
      minimalGameState(beforePlayer),
    );
    const previous = beforeSnapshots.get("p1");
    expect(previous).toBeDefined();

    for (const key of PLAYER_STATE_CHANGE_FIELD_KEYS) {
      const afterPlayer = registryAfterPlayers[key];
      const changes = buildPlayerStateChangesBody(
        previous as PlayerChangeSnapshot,
        afterPlayer,
      );
      expect(
        Object.keys(changes),
        `registry produced no diff for ${key}`,
      ).toContain(key);
      const parsed = PlayerStateChangesBodySchema.safeParse(changes);
      expect(
        parsed.success,
        `engine registry diff invalid for ${key}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`,
      ).toBe(true);
    }
  });

  it("web log formatter renders each PLAYER_STATE_CHANGE_FIELD_KEYS delta", () => {
    const tileNames = new Map<string, string>([
      ["1", "Tile 1"],
      ["2", "Tile 2"],
    ]);
    for (const key of PLAYER_STATE_CHANGE_FIELD_KEYS) {
      const formatted = formatGameLogEntry(
        {
          playerId: "p1",
          actionType: "player_state_changed",
          payload: { playerId: "p1", changes: minimalBodies[key] },
        },
        tileNames,
      );
      expect(
        formatted.length,
        `formatGameLogEntry produced no output for ${key}`,
      ).toBeGreaterThan("Player changed".length);
    }
  });
});
