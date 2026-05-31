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

type AlarmStore = {
  get: () => Promise<undefined>;
  put: () => Promise<void>;
  delete: () => Promise<void>;
  setAlarm: () => Promise<void>;
  deleteAlarm: () => Promise<void>;
};

function createMockState() {
  const storage: AlarmStore = {
    get: async () => undefined,
    put: async () => {},
    delete: async () => {},
    setAlarm: async () => {},
    deleteAlarm: async () => {},
  };
  return { storage } as unknown as DurableObjectState;
}

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
});
