import {
  finalizeAuctionSettleIfReady,
  normalizeGameState,
} from "@oligopoly/shared";
import app from "@oligopoly/worker";
import { createWorkerD1Stub } from "./workerD1Stub.js";

type Row = Record<string, unknown>;

const createD1Stub = createWorkerD1Stub;

const requestWithEnv = (
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    db?: D1Database;
  } = {},
) => {
  const { method = "GET", headers = {}, body, db } = options;
  const init: RequestInit = { method, headers: { ...headers } };
  if (body) {
    (init.headers as Record<string, string>)["Content-Type"] =
      "application/json";
    init.body = JSON.stringify(body);
  }
  return app.request(path, init, {
    ALLOWED_ORIGINS: "http://localhost:5173",
    DB: db,
  });
};

async function createAndStartGame(db: D1Database) {
  const createRes = await requestWithEnv("/api/lobbies", {
    method: "POST",
    headers: { "x-subject": "user-1" },
    body: {
      name: "Test Game Lobby",
      maxPlayers: 4,
      isPrivate: false,
      optionalRuleIds: [],
    },
    db,
  });
  const lobby = (await createRes.json()) as Record<string, unknown>;

  await requestWithEnv(`/api/lobbies/${lobby.id}/join`, {
    method: "POST",
    headers: { "x-subject": "user-2" },
    db,
  });

  const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
    method: "POST",
    headers: { "x-subject": "user-1" },
    db,
  });
  const startBody = (await startRes.json()) as Record<string, unknown>;

  const gameRow = (db as D1Database & { _tables: Record<string, Row[]> })
    ._tables.games[0];
  const state = JSON.parse(gameRow.state_json as string);

  return {
    gameId: startBody.gameId as string,
    lobbyId: lobby.id as string,
    turnOrder: state.turnOrder as string[],
    currentPlayer: state.turnOrder[0] as string,
    otherPlayer: state.turnOrder[1] as string,
  };
}

export async function createSoloAiGame(db: D1Database) {
  const createRes = await requestWithEnv("/api/lobbies", {
    method: "POST",
    headers: { "x-subject": "user-1" },
    body: {
      name: "Solo vs AI",
      maxPlayers: 2,
      isPrivate: false,
      optionalRuleIds: [],
      aiSlots: [{ id: "ai-1", name: "OpBot", personality: "opportunist" }],
    },
    db,
  });
  if (createRes.status !== 201) {
    throw new Error(`Failed to create lobby: ${createRes.status}`);
  }
  const lobby = (await createRes.json()) as Record<string, unknown>;

  const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
    method: "POST",
    headers: { "x-subject": "user-1" },
    db,
  });
  if (startRes.status !== 200) {
    throw new Error(`Failed to start lobby: ${startRes.status}`);
  }
  const startBody = (await startRes.json()) as Record<string, unknown>;

  const gameRow = (db as D1Database & { _tables: Record<string, Row[]> })
    ._tables.games[0];
  const state = JSON.parse(gameRow.state_json as string) as {
    turnOrder: string[];
  };

  return {
    gameId: startBody.gameId as string,
    humanId: "user-1",
    aiId: state.turnOrder.find((id) => id.startsWith("ai:")) ?? "",
    turnOrder: state.turnOrder,
    currentPlayer: state.turnOrder[0] as string,
  };
}

export async function stepAiUntil(
  db: D1Database,
  gameId: string,
  predicate: (body: Record<string, unknown>) => boolean,
  maxSteps = 16,
): Promise<Record<string, unknown>> {
  let lastBody: Record<string, unknown> = {};
  for (let i = 0; i < maxSteps; i++) {
    const res = await requestWithEnv(`/api/games/${gameId}/ai/step`, {
      method: "POST",
      db,
    });
    if (res.status === 409) {
      const harnessDb = db as HarnessDb;
      if (harnessDb._tables) {
        lastBody = loadStoredGameState(harnessDb, gameId) as Record<
          string,
          unknown
        >;
        if (predicate(lastBody)) return lastBody;
      }
      break;
    }
    if (res.status !== 200) {
      throw new Error(`AI step failed with status ${res.status}`);
    }
    lastBody = (await res.json()) as Record<string, unknown>;
    if (predicate(lastBody)) return lastBody;
  }
  if (!predicate(lastBody)) {
    throw new Error("AI stepping did not reach the expected state");
  }
  return lastBody;
}

export type HarnessDb = D1Database & {
  _tables: Record<string, Row[]>;
};

export type StoredGameState = {
  turnOrder: string[];
  currentPlayerIndex: number;
  phase?: string;
  pendingBuyTilePosition?: number | string | null;
};

export function loadStoredGameState(
  db: HarnessDb,
  gameId: string,
): StoredGameState {
  const row = db._tables.games.find((game) => game.id === gameId);
  if (!row?.state_json) {
    throw new Error(`Game row missing for ${gameId}`);
  }
  return JSON.parse(row.state_json as string) as StoredGameState;
}

export function storedActorId(state: StoredGameState): string {
  return state.turnOrder[state.currentPlayerIndex] ?? "";
}

export async function ensureActorTurn(
  db: HarnessDb,
  gameId: string,
  actorId: string,
  maxSteps = 16,
): Promise<StoredGameState> {
  for (let i = 0; i < maxSteps; i++) {
    const state = loadStoredGameState(db, gameId);
    if (storedActorId(state) === actorId) return state;

    const current = storedActorId(state);
    if (!current.startsWith("ai:")) {
      throw new Error(
        `Expected AI-controlled turn before ${actorId}, got ${current}`,
      );
    }

    const res = await requestWithEnv(`/api/games/${gameId}/ai/step`, {
      method: "POST",
      db,
    });
    if (res.status === 409) {
      const latest = loadStoredGameState(db, gameId);
      if (storedActorId(latest) === actorId) return latest;
      break;
    }
    if (res.status !== 200) {
      throw new Error(`AI step failed with status ${res.status}`);
    }
  }

  const finalState = loadStoredGameState(db, gameId);
  if (storedActorId(finalState) !== actorId) {
    throw new Error(
      `Timed out waiting for ${actorId}; current actor is ${storedActorId(finalState)}`,
    );
  }
  return finalState;
}

export function advanceAuctionSettle(db: D1Database, gameId: string) {
  const tables = (db as D1Database & { _tables: Record<string, Row[]> })
    ._tables;
  const gameRow = tables.games.find((row) => row.id === gameId);
  if (!gameRow?.state_json) {
    throw new Error(`Game ${gameId} not found`);
  }

  const state = normalizeGameState(
    JSON.parse(gameRow.state_json as string) as Record<string, unknown>,
  );
  const deadline = state.pendingAuction?.settleDeadlineAt ?? Date.now();
  const result = finalizeAuctionSettleIfReady(state, deadline + 1);
  if (!result) {
    throw new Error("Auction settle phase is not ready to finalize");
  }

  gameRow.state_json = JSON.stringify(result.state);
  return result;
}

export function isActorTurn(
  body: Record<string, unknown>,
  actorId: string,
): boolean {
  const turnOrder = body.turnOrder as string[] | undefined;
  const index = body.currentPlayerIndex as number | undefined;
  if (!turnOrder || index === undefined) return false;
  return turnOrder[index] === actorId;
}

export { createAndStartGame, createD1Stub, createWorkerD1Stub, requestWithEnv };
