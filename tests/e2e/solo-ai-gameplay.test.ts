import { describe, expect, it } from "vitest";
import {
  createD1Stub,
  createSoloAiGame,
  ensureActorTurn,
  type HarnessDb,
  isActorTurn,
  requestWithEnv,
  stepAiUntil,
} from "../helpers/workerGameplayHarness.js";

describe("e2e solo vs AI gameplay", () => {
  it("runs a human turn and AI response through the HTTP API", async () => {
    const db = createD1Stub() as HarnessDb;
    const { gameId, humanId } = await createSoloAiGame(db);

    await ensureActorTurn(db, gameId, humanId);

    const drawRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": humanId },
      body: { type: "draw_market_event" },
      db,
    });
    expect(drawRes.status).toBe(200);

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
      (body) => isActorTurn(body, humanId),
      16,
    );
    expect(isActorTurn(afterAi, humanId)).toBe(true);
    expect([
      "waiting_for_roll",
      "rolling_doubles",
      "waiting_for_market_event",
    ]).toContain(afterAi.phase);
  });
});
