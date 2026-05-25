import { describe, expect, it } from "vitest";
import {
  createD1Stub,
  createSoloAiGame,
  requestWithEnv,
  stepAiUntil,
} from "../helpers/workerGameplayHarness.js";

type StoredGameState = {
  turnOrder: string[];
  currentPlayerIndex: number;
  phase?: string;
  pendingBuyTilePosition?: number | string | null;
};

type HarnessDb = D1Database & {
  _tables: { games: Array<{ id: string; state_json: string }> };
};

function loadStoredGameState(db: HarnessDb, gameId: string): StoredGameState {
  const row = db._tables.games.find((game) => game.id === gameId);
  if (!row) throw new Error("Game row missing");
  return JSON.parse(row.state_json) as StoredGameState;
}

function currentActorId(state: StoredGameState): string {
  return state.turnOrder[state.currentPlayerIndex] ?? "";
}

async function ensureHumanTurn(db: HarnessDb, gameId: string, humanId: string) {
  for (let i = 0; i < 16; i++) {
    const state = loadStoredGameState(db, gameId);
    if (currentActorId(state) === humanId) return state;

    const aiStep = await requestWithEnv(`/api/games/${gameId}/ai/step`, {
      method: "POST",
      db,
    });
    if (aiStep.status === 409) {
      const latest = loadStoredGameState(db, gameId);
      if (currentActorId(latest) === humanId) return latest;
      break;
    }
    expect(aiStep.status).toBe(200);
  }

  const finalState = loadStoredGameState(db, gameId);
  expect(currentActorId(finalState)).toBe(humanId);
  return finalState;
}

describe("e2e solo vs AI gameplay", () => {
  it("runs a human turn and AI response through the HTTP API", async () => {
    const db = createD1Stub() as HarnessDb;
    const { gameId, humanId } = await createSoloAiGame(db);

    await ensureHumanTurn(db, gameId, humanId);

    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": humanId },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    expect(rollRes.status).toBe(200);
    const rollBody = (await rollRes.json()) as Record<string, unknown>;

    if (
      rollBody.phase === "waiting_for_buy" &&
      rollBody.pendingBuyTilePosition
    ) {
      const buyRes = await requestWithEnv(`/api/games/${gameId}/action`, {
        method: "POST",
        headers: { "x-subject": humanId },
        body: {
          type: "buy_tile",
          tilePosition: rollBody.pendingBuyTilePosition,
        },
        db,
      });
      expect(buyRes.status).toBe(200);
    } else if (rollBody.phase === "waiting_for_path_choice") {
      const pathRes = await requestWithEnv(`/api/games/${gameId}/action`, {
        method: "POST",
        headers: { "x-subject": humanId },
        body: { type: "path_choice", choice: "perimeter" },
        db,
      });
      expect(pathRes.status).toBe(200);
    }

    const endRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": humanId },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes.status).toBe(200);
    const endBody = (await endRes.json()) as Record<string, unknown>;
    expect(endBody.phase).toBe("waiting_for_roll");

    const afterAi = await stepAiUntil(
      db,
      gameId,
      (body) => isHumanTurn(body, humanId),
      16,
    );
    expect(isHumanTurn(afterAi, humanId)).toBe(true);
    expect(["waiting_for_roll", "rolling_doubles"]).toContain(afterAi.phase);
  });
});

function isHumanTurn(body: Record<string, unknown>, humanId: string): boolean {
  const turnOrder = body.turnOrder as string[] | undefined;
  const index = body.currentPlayerIndex as number | undefined;
  if (!turnOrder || index === undefined) return false;
  return turnOrder[index] === humanId;
}
