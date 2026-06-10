import { LobbyErrorKeys, type LobbyResponse } from "@oligopoly/validation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ApiError,
  createInviteToken,
  createLobby,
  fetchLobby,
  joinLobby,
  joinLobbyWithToken,
  leaveLobby,
  listMyLobbies,
  startLobby,
} from "../api/lobbies";
import { useAuth } from "../components/AuthContext";
import { CreateLobbyPanel } from "../components/CreateLobbyPanel";
import { JoinLobbyPanel } from "../components/JoinLobbyPanel";
import { LobbyFirstGamePanel } from "../components/LobbyFirstGamePanel";
import { PublicLobbiesPanel } from "../components/PublicLobbiesPanel";
import {
  type InviteShare,
  SelectedLobbyRoom,
  type SelectedLobbyRoomActions,
  type SelectedLobbyRoomViewModel,
} from "../components/SelectedLobbyRoom";
import { UserLobbiesPanel } from "../components/UserLobbiesPanel";
import { useLobbyRealtime } from "../hooks/useLobbyRealtime";
import {
  type LobbyBannerMessage,
  type PublicLobbyList,
  usePublicLobbiesRefresh,
} from "../hooks/usePublicLobbiesRefresh";
import { lobbySeatCount } from "../lib/lobbySeats";

const DEFAULT_MAX_PLAYERS = 4;

const normalizeLobby = (
  lobby: Awaited<ReturnType<typeof fetchLobby>>,
): LobbyResponse => ({
  ...lobby,
  aiSlots: lobby.aiSlots ?? [],
});
const MAX_ACTIVE_LOBBIES_PER_USER = 2;

type Message = LobbyBannerMessage;

const resolveLobbyJoinInput = (rawLobbyId: string, rawToken: string) => {
  const lobbyId = rawLobbyId.trim();
  const token = rawToken.trim();

  if (!lobbyId) {
    return { lobbyId: "", token };
  }

  try {
    const origin =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const parsed = new URL(lobbyId, origin);
    const sharedLobbyId = parsed.searchParams.get("id")?.trim() ?? "";

    if (parsed.pathname === "/lobbies" && sharedLobbyId) {
      return {
        lobbyId: sharedLobbyId,
        token: parsed.searchParams.get("token")?.trim() ?? token,
      };
    }
  } catch {
    // Treat the input as a raw lobby id when it is not a valid URL.
  }

  return { lobbyId, token };
};

type JoinStrategy =
  | { kind: "public"; lobbyId: string }
  | { kind: "private"; lobbyId: string; token: string };

const resolveJoinStrategy = (
  resolved: ReturnType<typeof resolveLobbyJoinInput>,
  selectedLobby: LobbyResponse | null,
): JoinStrategy => {
  const useInviteToken =
    Boolean(resolved.token) &&
    (selectedLobby?.id !== resolved.lobbyId || selectedLobby.isPrivate);
  return useInviteToken
    ? { kind: "private", lobbyId: resolved.lobbyId, token: resolved.token }
    : { kind: "public", lobbyId: resolved.lobbyId };
};

const buildInviteUrl = (lobbyId: string, token: string) => {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new URL(
    `/lobbies?id=${encodeURIComponent(lobbyId)}&token=${encodeURIComponent(token)}`,
    origin,
  ).toString();
};

const describeLobbyError = (fallback: string, error: unknown) => {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  switch (error.message) {
    case LobbyErrorKeys.MEMBERSHIP_LIMIT_REACHED:
      return `You can only be in ${MAX_ACTIVE_LOBBIES_PER_USER} waiting lobbies at once. Leave one before creating or joining another.`;
    case LobbyErrorKeys.NOT_IN_LOBBY:
      return "You are no longer in that lobby.";
    default:
      return `${fallback}: ${error.message}`;
  }
};

export function LobbiesPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialLobbyId = searchParams.get("id")?.trim() ?? "";
  const initialJoinToken = searchParams.get("token")?.trim() ?? "";
  const initialSetup = searchParams.get("setup")?.trim() ?? "";
  const soloAiSetup = initialSetup === "solo-ai";

  const [createName, setCreateName] = useState(
    soloAiSetup ? "Solo Practice" : "New Lobby",
  );
  const [createMaxPlayers, setCreateMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
  const [createIsPrivate, setCreateIsPrivate] = useState(true);
  const [createAiCount, setCreateAiCount] = useState(soloAiSetup ? 1 : 0);
  const [createAiPersonality, setCreateAiPersonality] = useState<
    "loyalist" | "opportunist" | "disruptor"
  >("opportunist");

  const [joinLobbyId, setJoinLobbyId] = useState(initialLobbyId);
  const [joinToken, setJoinToken] = useState(initialJoinToken);

  const [loadingPublicLobbies, setLoadingPublicLobbies] = useState(true);
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbyList>([]);
  const [loadingMyLobbies, setLoadingMyLobbies] = useState(false);
  const [myLobbies, setMyLobbies] = useState<
    Awaited<ReturnType<typeof listMyLobbies>>["lobbies"]
  >([]);
  const [selectedLobby, setSelectedLobby] = useState<LobbyResponse | null>(
    null,
  );
  const [inviteShare, setInviteShare] = useState<InviteShare | null>(null);

  const [busyCreate, setBusyCreate] = useState(false);
  const [busyJoin, setBusyJoin] = useState(false);
  const [busyInvite, setBusyInvite] = useState(false);
  const [busyLeave, setBusyLeave] = useState(false);
  const [busyStart, setBusyStart] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const selectedLobbyCardRef = useRef<HTMLDivElement | null>(null);

  const selectedLobbyId = selectedLobby?.id ?? joinLobbyId;
  const resolvedJoinInput = useMemo(
    () => resolveLobbyJoinInput(joinLobbyId, joinToken),
    [joinLobbyId, joinToken],
  );

  const revealSelectedLobby = useCallback(() => {
    window.requestAnimationFrame(() => {
      selectedLobbyCardRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const { refreshPublicLobbies } = usePublicLobbiesRefresh(
    setLoadingPublicLobbies,
    setPublicLobbies,
    setMessage,
  );

  const refreshMyLobbies = useCallback(async () => {
    if (!user) {
      setMyLobbies([]);
      setLoadingMyLobbies(false);
      return;
    }

    setLoadingMyLobbies(true);
    try {
      const data = await listMyLobbies();
      setMyLobbies(data.lobbies);
    } catch (error) {
      setMyLobbies([]);
      setMessage({
        kind: "error",
        text: describeLobbyError("Failed to load your lobbies", error),
      });
    } finally {
      setLoadingMyLobbies(false);
    }
  }, [user]);

  const commitSelectedLobby = useCallback((lobby: LobbyResponse) => {
    const normalized = normalizeLobby(lobby);
    setSelectedLobby(normalized);
    setJoinLobbyId(normalized.id);
    if (!normalized.isPrivate) {
      setJoinToken("");
    }
    setMyLobbies((current) => {
      if (!current.some((candidate) => candidate.id === normalized.id)) {
        return current;
      }
      return current.map((candidate) =>
        candidate.id === normalized.id ? normalized : candidate,
      );
    });
  }, []);

  const refreshSelectedLobby = useCallback(
    async (id: string) => {
      if (!id) {
        setSelectedLobby(null);
        return;
      }
      try {
        commitSelectedLobby(normalizeLobby(await fetchLobby(id)));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setSelectedLobby(null);
          setMessage({ kind: "error", text: "Lobby not found." });
          return;
        }
        setMessage({
          kind: "error",
          text:
            error instanceof ApiError
              ? `Failed to load lobby: ${error.message}`
              : "Failed to load lobby",
        });
      }
    },
    [commitSelectedLobby],
  );

  const { wsStatus: lobbyWsStatus } = useLobbyRealtime(selectedLobby?.id, {
    onUpdate: ({ lobby }) => commitSelectedLobby(lobby),
  });

  useEffect(() => {
    void refreshPublicLobbies();
  }, [refreshPublicLobbies]);

  useEffect(() => {
    if (initialLobbyId) {
      setJoinLobbyId(initialLobbyId);
      void refreshSelectedLobby(initialLobbyId);
    }
  }, [initialLobbyId, refreshSelectedLobby]);

  useEffect(() => {
    if (initialJoinToken) {
      setJoinToken(initialJoinToken);
    }
  }, [initialJoinToken]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      setMyLobbies([]);
      setLoadingMyLobbies(false);
      return;
    }

    void refreshMyLobbies();
  }, [loading, refreshMyLobbies, user]);

  useEffect(() => {
    if (
      !selectedLobby?.id ||
      selectedLobby.status !== "waiting" ||
      lobbyWsStatus === "connected"
    ) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        commitSelectedLobby(normalizeLobby(await fetchLobby(selectedLobby.id)));
      } catch {
        // Keep the current lobby visible if a transient refresh fails.
      }
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [
    commitSelectedLobby,
    lobbyWsStatus,
    selectedLobby?.id,
    selectedLobby?.status,
  ]);

  useEffect(() => {
    setCreateAiCount((count) => Math.min(count, createMaxPlayers - 1));
  }, [createMaxPlayers]);

  const selectedLobbyMembership = useMemo(() => {
    if (!selectedLobby || !user) return null;
    return (
      selectedLobby.players.find((player) => player.userId === user.userId) ??
      null
    );
  }, [selectedLobby, user]);
  const isCurrentSubjectAdmin = Boolean(selectedLobbyMembership?.isAdmin);
  const isAtLobbyLimit = myLobbies.length >= MAX_ACTIVE_LOBBIES_PER_USER;

  useEffect(() => {
    if (
      selectedLobby?.status === "in_game" &&
      selectedLobby.gameId &&
      selectedLobbyMembership
    ) {
      navigate(`/games/${selectedLobby.gameId}`);
    }
  }, [navigate, selectedLobby, selectedLobbyMembership]);

  const signInHref = useMemo(() => {
    const returnTo = `${location.pathname}${location.search}`;
    return `/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, [location.pathname, location.search]);

  const selectedLobbyMembershipText = useMemo(() => {
    if (!selectedLobby) {
      return user
        ? "No lobby loaded yet."
        : "No lobby loaded yet. Sign in and load a lobby to check membership.";
    }

    if (!user) {
      return "Signed out. Loading a lobby does not add you to it.";
    }

    if (selectedLobbyMembership?.isAdmin) {
      return "You are in this lobby as an admin.";
    }

    if (selectedLobbyMembership) {
      return "You are in this lobby as a player.";
    }

    return "You are signed in, but not in this lobby.";
  }, [selectedLobby, selectedLobbyMembership, user]);

  const selectedLobbyActionText = useMemo(() => {
    if (!selectedLobby) {
      return "Load a lobby above to see whether your account is in its player list.";
    }

    if (!user) {
      return "You can inspect this lobby, but joining it requires a signed-in session.";
    }

    if (selectedLobbyMembership?.isAdmin) {
      if (selectedLobby.status !== "waiting") {
        return "You are already in this lobby as an admin, but it is no longer in the waiting state.";
      }
      if (lobbySeatCount(selectedLobby) < 2) {
        return "You are already in this lobby as an admin. You can manage invites, but starting still requires at least two seats.";
      }
      return "You are already in this lobby as an admin. You can manage invites and start the game when ready.";
    }

    if (selectedLobbyMembership) {
      return selectedLobby.status === "waiting"
        ? "You are already in this lobby. An admin must start the game."
        : "You are already in this lobby, but the game has already moved past the waiting lobby.";
    }

    if (selectedLobby.status !== "waiting") {
      return "This lobby has already started, so you cannot join it from here.";
    }

    if (lobbySeatCount(selectedLobby) >= selectedLobby.maxPlayers) {
      return "This lobby is full.";
    }

    if (isAtLobbyLimit) {
      return `You are already in ${MAX_ACTIVE_LOBBIES_PER_USER} waiting lobbies. Leave one before joining this lobby.`;
    }

    if (selectedLobby.isPrivate) {
      return resolvedJoinInput.token
        ? "This private lobby is joinable with the invite token currently in the form."
        : "This private lobby requires a valid invite token before you can join.";
    }

    return "This public lobby is joinable with your signed-in session.";
  }, [
    isAtLobbyLimit,
    resolvedJoinInput.token,
    selectedLobby,
    selectedLobbyMembership,
    user,
  ]);

  const startLobbyHelpText = useMemo(() => {
    if (!selectedLobby) {
      return null;
    }

    if (!user) {
      return "Start requires a signed-in session and admin membership in this lobby.";
    }

    if (!selectedLobbyMembership) {
      return "Start is only available after you join this lobby and have admin access.";
    }

    if (!selectedLobbyMembership.isAdmin) {
      return "You are in this lobby, but only admins can start the game.";
    }

    if (selectedLobby.status !== "waiting") {
      return "This lobby is no longer waiting, so start is unavailable.";
    }

    if (lobbySeatCount(selectedLobby) < 2) {
      return "Start unlocks for admins once at least two total human or AI seats are in the lobby.";
    }

    if (!selectedLobby.players.every((player) => player.isReady)) {
      return "Every human player must mark ready before you can start.";
    }

    return "You are an admin in this lobby and can start the game.";
  }, [selectedLobby, selectedLobbyMembership, user]);

  const createLobbyInvite = useCallback(async (lobbyId: string) => {
    const invite = await createInviteToken(lobbyId);
    const share = {
      lobbyId,
      token: invite.token,
      url: buildInviteUrl(lobbyId, invite.token),
      expiresInSeconds: invite.expiresInSeconds,
    };

    setInviteShare(share);
    return share;
  }, []);

  const normalizeJoinInputs = useCallback(() => {
    setJoinLobbyId(resolvedJoinInput.lobbyId);
    setJoinToken(resolvedJoinInput.token);
    return resolvedJoinInput;
  }, [resolvedJoinInput]);

  const copyInviteValue = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage({ kind: "ok", text: `${label} copied.` });
    } catch {
      setMessage({
        kind: "error",
        text: `Couldn't copy ${label.toLowerCase()}.`,
      });
    }
  }, []);

  const onCreateLobby = async () => {
    setBusyCreate(true);
    setMessage(null);
    setInviteShare(null);
    try {
      const lobby = await createLobby({
        name: createName.trim(),
        maxPlayers: createMaxPlayers,
        isPrivate: createIsPrivate,
        optionalRuleIds: [],
        aiSlots: Array.from({ length: createAiCount }, (_, index) => ({
          id: `ai-${index + 1}`,
          personality: createAiPersonality,
        })),
      });
      commitSelectedLobby(normalizeLobby(lobby));
      revealSelectedLobby();
      if (lobby.isPrivate) {
        try {
          await createLobbyInvite(lobby.id);
          setMessage({
            kind: "ok",
            text: `Created private lobby ${lobby.id}. Invite link ready.`,
          });
        } catch (error) {
          setMessage({
            kind: "error",
            text:
              error instanceof ApiError
                ? `Lobby created, but invite generation failed: ${error.message}`
                : "Lobby created, but invite generation failed",
          });
        }
      } else {
        setMessage({ kind: "ok", text: `Created lobby ${lobby.id}` });
      }
      await refreshMyLobbies();
      await refreshPublicLobbies();
    } catch (error) {
      setMessage({
        kind: "error",
        text: describeLobbyError("Create failed", error),
      });
    } finally {
      setBusyCreate(false);
    }
  };

  const onLoadLobby = async () => {
    setMessage(null);
    setInviteShare(null);

    const resolved = normalizeJoinInputs();
    if (!resolved.lobbyId) {
      setMessage({ kind: "error", text: "Lobby ID is required." });
      return;
    }

    await refreshSelectedLobby(resolved.lobbyId);
    revealSelectedLobby();
  };

  const onJoinLobby = async () => {
    const resolved = normalizeJoinInputs();
    if (!resolved.lobbyId) {
      setMessage({ kind: "error", text: "Lobby ID is required." });
      return;
    }

    setBusyJoin(true);
    setMessage(null);
    setInviteShare(null);
    try {
      const strategy = resolveJoinStrategy(resolved, selectedLobby);
      const lobby =
        strategy.kind === "private"
          ? await joinLobbyWithToken(strategy.lobbyId, strategy.token)
          : await joinLobby(strategy.lobbyId);
      commitSelectedLobby(normalizeLobby(lobby));
      if (lobby.isPrivate) {
        setJoinToken(resolved.token);
      }
      revealSelectedLobby();
      setMessage({ kind: "ok", text: `Joined lobby ${lobby.id}` });
      await refreshMyLobbies();
      await refreshPublicLobbies();
    } catch (error) {
      setMessage({
        kind: "error",
        text: describeLobbyError("Join failed", error),
      });
    } finally {
      setBusyJoin(false);
    }
  };

  const onGenerateInvite = async () => {
    if (!selectedLobby?.isPrivate) return;

    setBusyInvite(true);
    setMessage(null);
    try {
      await createLobbyInvite(selectedLobby.id);
      setMessage({ kind: "ok", text: "Invite link ready to share." });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError
            ? `Invite generation failed: ${error.message}`
            : "Invite generation failed",
      });
    } finally {
      setBusyInvite(false);
    }
  };

  const onStartLobby = async () => {
    if (!selectedLobbyId) return;
    setBusyStart(true);
    setMessage(null);
    try {
      const response = await startLobby(selectedLobbyId);
      await refreshSelectedLobby(selectedLobbyId);
      await refreshMyLobbies();
      await refreshPublicLobbies();
      if (response.gameId) {
        navigate(`/games/${response.gameId}`);
      } else {
        setMessage({ kind: "ok", text: "Lobby start requested." });
      }
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError
            ? `Start failed: ${error.message}`
            : "Start failed",
      });
    } finally {
      setBusyStart(false);
    }
  };

  const onLeaveLobby = async (lobbyId: string) => {
    setBusyLeave(true);
    setMessage(null);
    if (inviteShare?.lobbyId === lobbyId) {
      setInviteShare(null);
    }

    try {
      const response = await leaveLobby(lobbyId);

      if (selectedLobby?.id === lobbyId) {
        if (response.deleted || !response.lobby) {
          setSelectedLobby(null);
        } else {
          setSelectedLobby(normalizeLobby(response.lobby));
        }
      }

      if (joinLobbyId === lobbyId && response.deleted) {
        setJoinLobbyId("");
        setJoinToken("");
      }

      setMessage({
        kind: "ok",
        text: response.deleted
          ? `Left lobby ${response.lobbyId}. It was deleted because it became empty.`
          : `Left lobby ${response.lobbyId}`,
      });
      await refreshMyLobbies();
      await refreshPublicLobbies();
    } catch (error) {
      setMessage({
        kind: "error",
        text: describeLobbyError("Leave failed", error),
      });
    } finally {
      setBusyLeave(false);
    }
  };

  const selectedLobbyRoomView: SelectedLobbyRoomViewModel = {
    lobby: selectedLobby,
    inviteShare,
    isAdmin: isCurrentSubjectAdmin,
    membership: selectedLobbyMembership,
    membershipText: selectedLobbyMembershipText,
    actionText: selectedLobbyActionText,
    startHelpText: startLobbyHelpText,
    userId: user?.userId,
    signedIn: Boolean(user),
    loading,
    lobbyWsStatus,
    busyInvite,
    busyLeave,
    busyStart,
  };

  const selectedLobbyRoomActions: SelectedLobbyRoomActions = {
    onCopyInvite: (value, label) => void copyInviteValue(value, label),
    onGenerateInvite: () => void onGenerateInvite(),
    onLeaveLobby: (lobbyId) => void onLeaveLobby(lobbyId),
    onRefreshLobby: (lobbyId) => void refreshSelectedLobby(lobbyId),
    onStartLobby: () => void onStartLobby(),
    onReadyUpdated: (updated) => {
      const normalized = normalizeLobby(updated);
      setSelectedLobby(normalized);
      setMyLobbies((current) =>
        current.map((lobby) =>
          lobby.id === normalized.id ? normalized : lobby,
        ),
      );
    },
    onReadyBusy: setBusyStart,
    onReadyMessage: (text, kind) => setMessage({ text, kind }),
  };

  return (
    <div className="pageShell">
      <header className="pageHeader">
        <h1 className="pageTitle">Lobbies</h1>
        <p className="tagline">
          Create a first table, invite a friend, add AI seats, and start once
          every human player is ready.
        </p>
        <div className="statusStrip">
          <span className="statusChip">
            Slots {myLobbies.length}/{MAX_ACTIVE_LOBBIES_PER_USER}
          </span>
          <span className="statusChip">
            {user ? `Signed in as ${user.username}` : "Signed out"}
          </span>
          {selectedLobby && (
            <span className="statusChip">
              Selected {lobbySeatCount(selectedLobby)}/
              {selectedLobby.maxPlayers}
            </span>
          )}
        </div>
      </header>

      <div className="lobbyWorkspace">
        <section className="lobbyPrimary" aria-label="Lobby setup">
          <LobbyFirstGamePanel
            loading={loading}
            username={user?.username ?? null}
            signInHref={signInHref}
            waitingLobbyCount={myLobbies.length}
            maxWaitingLobbies={MAX_ACTIVE_LOBBIES_PER_USER}
          />

          <CreateLobbyPanel
            name={createName}
            maxPlayers={createMaxPlayers}
            isPrivate={createIsPrivate}
            aiCount={createAiCount}
            aiPersonality={createAiPersonality}
            waitingLobbyCount={myLobbies.length}
            maxWaitingLobbies={MAX_ACTIVE_LOBBIES_PER_USER}
            signedIn={Boolean(user)}
            loading={loading}
            busy={busyCreate}
            atLobbyLimit={isAtLobbyLimit}
            onNameChange={setCreateName}
            onMaxPlayersChange={setCreateMaxPlayers}
            onPrivateChange={setCreateIsPrivate}
            onAiCountChange={setCreateAiCount}
            onAiPersonalityChange={setCreateAiPersonality}
            onCreate={() => void onCreateLobby()}
          />

          <JoinLobbyPanel
            lobbyId={joinLobbyId}
            token={joinToken}
            signedIn={Boolean(user)}
            signInHref={signInHref}
            waitingLobbyCount={myLobbies.length}
            maxWaitingLobbies={MAX_ACTIVE_LOBBIES_PER_USER}
            loading={loading}
            busy={busyJoin}
            atLobbyLimit={isAtLobbyLimit}
            onLobbyInputChange={(nextValue) => {
              const parsed = resolveLobbyJoinInput(nextValue, "");
              setJoinLobbyId(nextValue);
              setJoinToken(parsed.token);
            }}
            onTokenChange={setJoinToken}
            onLoad={() => void onLoadLobby()}
            onJoin={() => void onJoinLobby()}
          />
        </section>
        <section className="lobbyLists" aria-label="Lobby lists and details">
          <UserLobbiesPanel
            loadingAuth={loading}
            signedIn={Boolean(user)}
            userId={user?.userId}
            lobbies={myLobbies}
            loadingLobbies={loadingMyLobbies}
            busyLeave={busyLeave}
            maxWaitingLobbies={MAX_ACTIVE_LOBBIES_PER_USER}
            onOpen={(lobbyId) => {
              setJoinLobbyId(lobbyId);
              setJoinToken("");
              void refreshSelectedLobby(lobbyId);
              revealSelectedLobby();
            }}
            onLeave={(lobbyId) => void onLeaveLobby(lobbyId)}
          />

          <PublicLobbiesPanel
            lobbies={publicLobbies}
            loading={loadingPublicLobbies}
            onSelect={(lobbyId) => {
              setJoinLobbyId(lobbyId);
              setJoinToken("");
              void refreshSelectedLobby(lobbyId);
              revealSelectedLobby();
            }}
          />

          <div
            className="card"
            ref={selectedLobbyCardRef}
            id="selected-lobby-room"
          >
            <h2>Selected lobby</h2>
            <SelectedLobbyRoom
              view={selectedLobbyRoomView}
              actions={selectedLobbyRoomActions}
            />
          </div>

          {selectedLobby?.status === "in_game" && (
            <div className="card">
              <h2>Next step</h2>
              {selectedLobby.gameId ? (
                <p>
                  Lobby started.{" "}
                  <Link to={`/games/${selectedLobby.gameId}`}>
                    Return to game
                  </Link>
                </p>
              ) : (
                <p className="muted">
                  Lobby started. Open <Link to="/games">Games</Link> to inspect
                  active games.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {message && (
        <p className={message.kind === "error" ? "errorText" : "ok"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
