import { afterEach, describe, expect, it, vi } from "vitest";
import { storeToken } from "./auth";
import {
  createInviteToken,
  createLobby,
  leaveLobby,
  listMyLobbies,
} from "./lobbies";

const lobbyResponse = {
  id: "lobby-1",
  name: "New Lobby",
  hostId: "user-1",
  status: "waiting" as const,
  maxPlayers: 4,
  isPrivate: false,
  optionalRuleIds: [],
  createdAt: 1,
  players: [{ userId: "user-1", isAdmin: true, joinedAt: 1 }],
};

describe("lobby API auth headers", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the stored Bearer token for lobby creation", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(lobbyResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);
    storeToken("session-token");

    await createLobby({
      name: "New Lobby",
      maxPlayers: 4,
      isPrivate: false,
      optionalRuleIds: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/api/lobbies",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("uses the stored Bearer token for invite creation", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            token: "invite-token",
            expiresInSeconds: 3600,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);
    storeToken("session-token");

    await createInviteToken("lobby-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/api/lobbies/lobby-1/invite",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });

  it("uses the stored Bearer token for my-lobbies lookup", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            lobbies: [],
            nextCursor: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);
    storeToken("session-token");

    await listMyLobbies();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/api/lobbies/mine",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });

  it("uses the stored Bearer token for leaving a lobby", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            lobbyId: "lobby-1",
            deleted: false,
            lobby: lobbyResponse,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);
    storeToken("session-token");

    await leaveLobby("lobby-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/api/lobbies/lobby-1/leave",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });
});
