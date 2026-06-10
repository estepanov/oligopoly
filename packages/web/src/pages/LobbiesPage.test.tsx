import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as lobbyApi from "../api/lobbies";
import { useAuth } from "../components/AuthContext";
import { LobbiesPage } from "./LobbiesPage";

vi.mock("../components/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../hooks/useLobbyRealtime", () => ({
  useLobbyRealtime: () => ({ wsStatus: "disconnected" }),
}));

vi.mock("../api/lobbies", async () => {
  const actual =
    await vi.importActual<typeof import("../api/lobbies")>("../api/lobbies");

  return {
    ...actual,
    createLobby: vi.fn(),
    createInviteToken: vi.fn(),
    fetchLobby: vi.fn(),
    joinLobby: vi.fn(),
    joinLobbyWithToken: vi.fn(),
    leaveLobby: vi.fn(),
    listMyLobbies: vi.fn(),
    listPublicLobbies: vi.fn(),
    startLobby: vi.fn(),
  };
});

const baseLobby = {
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

const mockedUseAuth = vi.mocked(useAuth);
const mockedCreateLobby = vi.mocked(lobbyApi.createLobby);
const mockedCreateInviteToken = vi.mocked(lobbyApi.createInviteToken);
const mockedFetchLobby = vi.mocked(lobbyApi.fetchLobby);
const mockedJoinLobby = vi.mocked(lobbyApi.joinLobby);
const mockedJoinLobbyWithToken = vi.mocked(lobbyApi.joinLobbyWithToken);
const mockedLeaveLobby = vi.mocked(lobbyApi.leaveLobby);
const mockedListMyLobbies = vi.mocked(lobbyApi.listMyLobbies);
const mockedListPublicLobbies = vi.mocked(lobbyApi.listPublicLobbies);

describe("LobbiesPage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      user: {
        userId: "user-1",
        username: "alice",
        expiresAt: Date.now() + 60_000,
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    mockedListPublicLobbies.mockResolvedValue({
      lobbies: [],
      nextCursor: null,
    });
    mockedListMyLobbies.mockResolvedValue({
      lobbies: [],
      nextCursor: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("makes signed-out browsing and join restrictions explicit", async () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <MemoryRouter>
        <LobbiesPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no public lobbies available/i);

    expect(screen.getByText(/you can browse first/i)).toBeInTheDocument();
    expect(
      screen.getByText(/start a private table, paste an invite/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/loading previews the table; joining seats/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/lobby id or invite link/i), {
      target: { value: "lobby-1" },
    });

    expect(
      screen.getByRole("button", { name: /create lobby/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /join lobby/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /load lobby/i }),
    ).not.toBeDisabled();
  });

  it("creates a private lobby and exposes a copyable invite link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    mockedCreateLobby.mockResolvedValue({
      ...baseLobby,
      id: "private-lobby",
      isPrivate: true,
    });
    mockedCreateInviteToken.mockResolvedValue({
      token: "invite-123",
      expiresInSeconds: 3600,
    });

    render(
      <MemoryRouter>
        <LobbiesPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no public lobbies available/i);

    fireEvent.change(screen.getByLabelText(/lobby visibility/i), {
      target: { value: "private" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create lobby/i }));

    await waitFor(() => {
      expect(mockedCreateInviteToken).toHaveBeenCalledWith("private-lobby");
    });

    const inviteLink = `${window.location.origin}/lobbies?id=private-lobby&token=invite-123`;

    expect(await screen.findByDisplayValue(inviteLink)).toBeInTheDocument();
    expect(
      screen.getByText(/you are in this lobby as an admin/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
    expect(screen.getByText(/human seat 1 · host/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate new invite/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/technical details/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(inviteLink);
    });
  });

  it("opens solo practice setup with one AI seat selected", async () => {
    render(
      <MemoryRouter initialEntries={["/lobbies?setup=solo-ai"]}>
        <LobbiesPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no public lobbies available/i);

    expect(screen.getByLabelText(/name/i)).toHaveValue("Solo Practice");
    expect(screen.getByLabelText(/ai players/i)).toHaveValue("1");
  });

  it("joins a private lobby from a pasted invite link", async () => {
    mockedJoinLobbyWithToken.mockResolvedValue({
      ...baseLobby,
      id: "shared-lobby",
      isPrivate: true,
      players: [
        ...baseLobby.players,
        { userId: "user-2", isAdmin: false, joinedAt: 2 },
      ],
    });

    render(
      <MemoryRouter>
        <LobbiesPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no public lobbies available/i);

    fireEvent.change(screen.getByLabelText(/lobby id or invite link/i), {
      target: {
        value: "http://localhost/lobbies?id=shared-lobby&token=invite-join",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /join lobby/i }));

    await waitFor(() => {
      expect(mockedJoinLobbyWithToken).toHaveBeenCalledWith(
        "shared-lobby",
        "invite-join",
      );
    });

    expect(screen.getByLabelText(/lobby id or invite link/i)).toHaveValue(
      "shared-lobby",
    );
    expect(screen.getByLabelText(/invite token/i)).toHaveValue("invite-join");
  });

  it("joins a selected public lobby directly when the invite token field is stale", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        userId: "viewer-1",
        username: "viewer",
        expiresAt: Date.now() + 60_000,
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    const publicLobby = {
      ...baseLobby,
      id: "public-lobby",
      name: "Public Lobby",
      isPrivate: false,
    };
    mockedListPublicLobbies.mockResolvedValue({
      lobbies: [publicLobby],
      nextCursor: null,
    });
    mockedFetchLobby.mockResolvedValue(publicLobby);
    mockedJoinLobby.mockResolvedValue({
      ...publicLobby,
      players: [
        ...publicLobby.players,
        { userId: "viewer-1", isAdmin: false, joinedAt: 2 },
      ],
    });

    render(
      <MemoryRouter>
        <LobbiesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Public Lobby")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/invite token/i), {
      target: { value: "stale-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: /select/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/invite token/i)).toHaveValue("");
    });

    fireEvent.click(screen.getByRole("button", { name: /join lobby/i }));

    await waitFor(() => {
      expect(mockedJoinLobby).toHaveBeenCalledWith("public-lobby");
    });
    expect(mockedJoinLobbyWithToken).not.toHaveBeenCalled();
  });

  it("clears a stale invite token when a raw lobby ID is typed manually", async () => {
    mockedJoinLobby.mockResolvedValue({
      ...baseLobby,
      id: "manual-public-lobby",
      players: [
        ...baseLobby.players,
        { userId: "user-2", isAdmin: false, joinedAt: 2 },
      ],
    });

    render(
      <MemoryRouter>
        <LobbiesPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no public lobbies available/i);

    fireEvent.change(screen.getByLabelText(/invite token/i), {
      target: { value: "stale-token" },
    });
    expect(screen.getByLabelText(/invite token/i)).toHaveValue("stale-token");

    fireEvent.change(screen.getByLabelText(/lobby id or invite link/i), {
      target: { value: "manual-public-lobby" },
    });
    expect(screen.getByLabelText(/invite token/i)).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: /join lobby/i }));

    await waitFor(() => {
      expect(mockedJoinLobby).toHaveBeenCalledWith("manual-public-lobby");
    });
    expect(mockedJoinLobbyWithToken).not.toHaveBeenCalled();
  });

  it("shows the signed-in user's waiting lobbies and enforces the 2-lobby limit in the UI", async () => {
    mockedListMyLobbies.mockResolvedValue({
      lobbies: [
        {
          ...baseLobby,
          id: "owned-lobby",
          name: "Owned Lobby",
        },
        {
          ...baseLobby,
          id: "joined-lobby",
          name: "Joined Lobby",
          hostId: "user-2",
          players: [
            { userId: "user-2", isAdmin: true, joinedAt: 1 },
            { userId: "user-1", isAdmin: false, joinedAt: 2 },
          ],
        },
      ],
      nextCursor: null,
    });

    render(
      <MemoryRouter>
        <LobbiesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Owned Lobby")).toBeInTheDocument();
    expect(screen.getByText("Joined Lobby")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Player")).toBeInTheDocument();
    expect(screen.getAllByText(/waiting lobby slots used: 2\/2/i)).toHaveLength(
      3,
    );
    expect(
      screen.getByRole("button", { name: /create lobby/i }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/lobby id or invite link/i), {
      target: { value: "other-lobby" },
    });

    expect(screen.getByRole("button", { name: /join lobby/i })).toBeDisabled();
  });

  it("lets a signed-in user leave one of their waiting lobbies", async () => {
    mockedListMyLobbies
      .mockResolvedValueOnce({
        lobbies: [
          {
            ...baseLobby,
            id: "owned-lobby",
            name: "Owned Lobby",
          },
        ],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        lobbies: [],
        nextCursor: null,
      });
    mockedLeaveLobby.mockResolvedValue({
      lobbyId: "owned-lobby",
      deleted: true,
    });

    render(
      <MemoryRouter>
        <LobbiesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Owned Lobby")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^leave$/i }));

    await waitFor(() => {
      expect(mockedLeaveLobby).toHaveBeenCalledWith("owned-lobby");
    });

    expect(
      await screen.findByText(/it was deleted because it became empty/i),
    ).toBeInTheDocument();
  });

  it("shows when a signed-in viewer has loaded a lobby without joining it", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        userId: "viewer-1",
        username: "viewer",
        expiresAt: Date.now() + 60_000,
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
    });

    mockedFetchLobby.mockResolvedValue(baseLobby);

    render(
      <MemoryRouter initialEntries={["/lobbies?id=lobby-1"]}>
        <LobbiesPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/you are signed in, but not in this lobby/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /this public lobby is joinable with your signed-in session/i,
      ),
    ).toBeInTheDocument();
  });
});
