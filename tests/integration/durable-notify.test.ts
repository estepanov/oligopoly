import { GameRoom, LobbyRoom } from "@oligopoly/worker";
import { describe, expect, it } from "vitest";

/**
 * Regression tests for the Durable Object internal fan-out routing.
 *
 * Internal broadcasts POST to the `/notify` path (carrying gameId/lobbyId as a
 * query param). A prior defect detected notify by a `?notify` query key that
 * the senders never set, so `handleNotify` never ran — silently breaking all
 * WebSocket broadcasts, auction settle/bid alarms, AI automation, and turn
 * timeouts. These tests assert notify POSTs are recognized by pathname.
 */

function createMockState() {
  const storage = {
    get: async () => undefined,
    put: async () => {},
    delete: async () => {},
    setAlarm: async () => {},
    deleteAlarm: async () => {},
  };
  return { storage } as unknown as DurableObjectState;
}

/** Mock DO state that records the alarm deadlines scheduled via setAlarm. */
function createAlarmTrackingState() {
  const setAlarmCalls: number[] = [];
  const store = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => store.get(key),
    put: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    setAlarm: async (time: number) => {
      setAlarmCalls.push(time);
    },
    deleteAlarm: async () => {},
  };
  return { state: { storage } as unknown as DurableObjectState, setAlarmCalls };
}

const humanPlayer = (playerId: string, actionPoints: number) => ({
  playerId,
  kind: "human" as const,
  position: 0,
  capital: 1500,
  ownedTilePositions: [],
  mortgagedTilePositions: [],
  developmentTokens: {},
  trustworthiness: 7,
  actionPointsRemaining: actionPoints,
  inRegulation: false,
  doublesCount: 0,
  isOnDiagonal: false,
});

const notifyRequest = (path: string, body: unknown) =>
  new Request(`https://oligopoly.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Durable Object notify routing", () => {
  it("LobbyRoom handles POST /notify?lobbyId=... (returns ok, not 426)", async () => {
    const room = new LobbyRoom(createMockState(), {});
    const res = await room.fetch(
      notifyRequest("/notify?lobbyId=lobby-1", {
        type: "lobby.updated",
        lobbyId: "lobby-1",
        payload: { lobbyId: "lobby-1" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("GameRoom handles POST /notify?gameId=... (returns ok, not 426)", async () => {
    const room = new GameRoom(createMockState(), {});
    const res = await room.fetch(
      notifyRequest("/notify?gameId=game-1", {
        type: "game.snapshot",
        gameId: "game-1",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("rejects non-notify, non-upgrade POSTs with 426", async () => {
    const room = new GameRoom(createMockState(), {});
    const res = await room.fetch(
      new Request("https://oligopoly.internal/something", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(426);
  });

  it("does not treat a nested */notify path as a notify request", async () => {
    const room = new GameRoom(createMockState(), {});
    const res = await room.fetch(
      notifyRequest("/internal/notify?gameId=g1", { type: "game.snapshot" }),
    );
    expect(res.status).toBe(426);
  });

  // Guards the *second half* of the original notify defect: handleNotify must
  // drive syncAfterStateChange so turn/auction alarms reschedule on state change.
  it("reschedules the turn alarm when a game.action_applied notify arrives", async () => {
    const { state, setAlarmCalls } = createAlarmTrackingState();
    const room = new GameRoom(state, {});
    const gameState = {
      gameId: "g1",
      round: 1,
      phase: "waiting_for_roll",
      turnOrder: ["p1", "p2"],
      currentPlayerIndex: 0,
      players: [humanPlayer("p1", 2), humanPlayer("p2", 0)],
      settings: { turnTimeout: "5min" },
    };
    const res = await room.fetch(
      notifyRequest("/notify?gameId=g1", {
        type: "game.action_applied",
        gameId: "g1",
        state: gameState,
      }),
    );
    expect(res.status).toBe(200);
    expect(setAlarmCalls.length).toBeGreaterThan(0);
    expect(setAlarmCalls.at(-1) ?? 0).toBeGreaterThan(Date.now());
  });
});
