import { afterEach, describe, expect, it } from "vitest";
import { storeToken } from "./auth";
import { gameWebSocketUrl } from "./games";

describe("gameWebSocketUrl", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("adds the stored token for participant sockets", () => {
    storeToken("game-token");

    expect(gameWebSocketUrl("game-1")).toBe(
      "ws://localhost:8787/api/games/game-1/ws?access_token=game-token",
    );
  });

  it("does not add a token for spectator sockets", () => {
    storeToken("game-token");

    expect(gameWebSocketUrl("game-1", true)).toBe(
      "ws://localhost:8787/api/games/game-1/spectate",
    );
  });
});
