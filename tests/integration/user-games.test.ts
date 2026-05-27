import { describe, expect, it } from "vitest";
import { createWorkerD1Stub } from "../helpers/workerD1Stub.js";
import {
  createAndStartGame,
  markLobbyPlayersReady,
  requestWithEnv,
} from "../helpers/workerGameplayHarness.js";

describe("GET /api/users/me/games", () => {
  it("returns games the authenticated user participated in", async () => {
    const db = createWorkerD1Stub();

    await db
      .prepare(
        `INSERT INTO users (id, username, display_name, created_at, updated_at)
         VALUES ('user-1', 'alice', 'Alice', 1, 1),
                ('user-2', 'bob', 'Bob', 1, 1)`,
      )
      .run();

    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "History Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobby = (await createRes.json()) as { id: string };

    await requestWithEnv(`/api/lobbies/${lobby.id}/join`, {
      method: "POST",
      headers: { "x-subject": "user-2" },
      db,
    });
    await markLobbyPlayersReady(db, lobby.id, ["user-1", "user-2"]);

    const { gameId } = await createAndStartGame(db);

    const res = await requestWithEnv("/api/users/me/games", {
      method: "GET",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ gameId: string }>;
    expect(body.some((entry) => entry.gameId === gameId)).toBe(true);
  });
});
