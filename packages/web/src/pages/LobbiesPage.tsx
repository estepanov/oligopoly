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
  listPublicLobbies,
  startLobby,
} from "../api/lobbies";
import { useAuth } from "../components/AuthContext";
import { LobbyAiSettings } from "../components/LobbyAiSettings";
import { LobbyReadyControls } from "../components/LobbyReadyControls";
import { useLobbyRealtime } from "../hooks/useLobbyRealtime";
import { canStartLobby, lobbySeatCount } from "../lib/lobbySeats";

const DEFAULT_MAX_PLAYERS = 4;

const normalizeLobby = (
  lobby: Awaited<ReturnType<typeof fetchLobby>>,
): LobbyResponse => ({
  ...lobby,
  aiSlots: lobby.aiSlots ?? [],
});
const MAX_ACTIVE_LOBBIES_PER_USER = 2;

type Message = { kind: "ok" | "error"; text: string } | null;
type InviteShare = {
  lobbyId: string;
  token: string;
  url: string;
  expiresInSeconds: number;
};

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

const formatLobbyPlayerLabels = (
  player: LobbyResponse["players"][number],
  viewerId: string | undefined,
) =>
  [
    player.userId === viewerId ? "you" : null,
    player.isAdmin ? "admin" : null,
    player.isReady ? "ready" : "not ready",
  ]
    .filter(Boolean)
    .join(", ");

const buildInviteUrl = (lobbyId: string, token: string) => {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new URL(
    `/lobbies?id=${encodeURIComponent(lobbyId)}&token=${encodeURIComponent(token)}`,
    origin,
  ).toString();
};

const formatInviteExpiry = (expiresInSeconds: number) => {
  const expiresInMinutes = Math.max(1, Math.round(expiresInSeconds / 60));
  return `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;
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

  const [createName, setCreateName] = useState("New Lobby");
  const [createMaxPlayers, setCreateMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
  const [createIsPrivate, setCreateIsPrivate] = useState(false);
  const [createAiCount, setCreateAiCount] = useState(1);
  const [createAiPersonality, setCreateAiPersonality] = useState<
    "loyalist" | "opportunist" | "disruptor"
  >("opportunist");

  const [joinLobbyId, setJoinLobbyId] = useState(initialLobbyId);
  const [joinToken, setJoinToken] = useState(initialJoinToken);

  const [loadingPublicLobbies, setLoadingPublicLobbies] = useState(true);
  const [publicLobbies, setPublicLobbies] = useState<
    Awaited<ReturnType<typeof listPublicLobbies>>["lobbies"]
  >([]);
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

  const refreshPublicLobbies = useCallback(async () => {
    setLoadingPublicLobbies(true);
    try {
      const data = await listPublicLobbies();
      setPublicLobbies(data.lobbies);
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError
            ? `Failed to load public lobbies: ${error.message}`
            : "Failed to load public lobbies",
      });
    } finally {
      setLoadingPublicLobbies(false);
    }
  }, []);

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

  return (
    <div>
      <h1 className="pageTitle">Lobbies</h1>
      <p className="tagline">
        Create, join, and start games through the Worker lobby API.
      </p>

      <div className="card">
        <h2>Your access</h2>
        {loading && <p className="muted">Loading session…</p>}
        {!loading && (
          <dl className="detailsGrid">
            <dt className="muted">Session</dt>
            <dd>
              {user ? (
                <>
                  Signed in as <strong>{user.username}</strong>
                </>
              ) : (
                "Signed out"
              )}
            </dd>
            <dt className="muted">Without signing in</dt>
            <dd>
              Browse public lobbies and load a lobby by ID or invite link.
              Loading only shows details; it does not join you.
            </dd>
            <dt className="muted">After signing in</dt>
            <dd>
              Create lobbies, join public lobbies, join private lobbies with a
              valid invite token, generate private invites when you are an
              admin, and start a lobby when you are an admin with at least two
              players.
            </dd>
            <dt className="muted">Selected lobby status</dt>
            <dd>{selectedLobbyMembershipText}</dd>
          </dl>
        )}
        {!loading && !user && (
          <p className="muted">
            Join and create actions stay disabled until you{" "}
            <Link to={signInHref}>sign in</Link>.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Create lobby</h2>
        <p className="muted">
          Requires a signed-in session. Creating a lobby adds your account as
          the first player and admin.
        </p>
        {user && (
          <p className="muted">
            Waiting lobby slots used: {myLobbies.length}/
            {MAX_ACTIVE_LOBBIES_PER_USER}.
          </p>
        )}
        <div className="formGrid">
          <div>
            <label className="fieldLabel" htmlFor="create-name">
              Name
            </label>
            <input
              id="create-name"
              className="textInput"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </div>
          <div>
            <label className="fieldLabel" htmlFor="create-max">
              Max players
            </label>
            <select
              id="create-max"
              className="textInput"
              value={createMaxPlayers}
              onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}
            >
              {[2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
        </div>
        <LobbyAiSettings
          aiCount={createAiCount}
          maxPlayers={createMaxPlayers}
          personality={createAiPersonality}
          onAiCountChange={setCreateAiCount}
          onPersonalityChange={setCreateAiPersonality}
        />
        <div className="formGrid">
          <div>
            <label className="fieldLabel" htmlFor="create-visibility">
              Lobby visibility
            </label>
            <select
              id="create-visibility"
              className="textInput"
              value={createIsPrivate ? "private" : "public"}
              onChange={(e) => setCreateIsPrivate(e.target.value === "private")}
            >
              <option value="public">Public - joinable by lobby ID</option>
              <option value="private">Private - invite token required</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className="button"
          disabled={
            busyCreate ||
            loading ||
            !user ||
            isAtLobbyLimit ||
            !createName.trim()
          }
          onClick={onCreateLobby}
        >
          {busyCreate ? "Creating…" : "Create lobby"}
        </button>
        {user && isAtLobbyLimit && (
          <p className="muted">
            Leave one of your waiting lobbies before creating another.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Join or load lobby</h2>
        <p className="muted">
          Load lobby fetches details only. Join lobby adds your signed-in
          account to that lobby.
        </p>
        <p className="muted">
          {user ? (
            "Public lobbies can be joined directly. Private lobbies require a valid invite token."
          ) : (
            <>
              You are signed out. Loading is available, but joining is disabled
              until you <Link to={signInHref}>sign in</Link>.
            </>
          )}
        </p>
        {user && (
          <p className="muted">
            Waiting lobby slots used: {myLobbies.length}/
            {MAX_ACTIVE_LOBBIES_PER_USER}.
          </p>
        )}
        <div className="formGrid">
          <div>
            <label className="fieldLabel" htmlFor="join-id">
              Lobby ID or invite link
            </label>
            <input
              id="join-id"
              className="textInput"
              value={joinLobbyId}
              onChange={(e) => {
                const nextValue = e.target.value;
                const parsed = resolveLobbyJoinInput(nextValue, "");
                setJoinLobbyId(nextValue);
                setJoinToken(parsed.token);
              }}
              placeholder="Paste lobby id or invite link"
            />
          </div>
          <div>
            <label className="fieldLabel" htmlFor="join-token">
              Invite token (optional)
            </label>
            <input
              id="join-token"
              className="textInput"
              value={joinToken}
              onChange={(e) => setJoinToken(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="buttonRow">
          <button
            type="button"
            className="button buttonSecondary"
            onClick={onLoadLobby}
            disabled={!joinLobbyId.trim()}
          >
            Load lobby
          </button>
          <button
            type="button"
            className="button"
            onClick={onJoinLobby}
            disabled={
              busyJoin ||
              loading ||
              !user ||
              isAtLobbyLimit ||
              !joinLobbyId.trim()
            }
          >
            {busyJoin ? "Joining…" : "Join lobby"}
          </button>
        </div>
        {user && isAtLobbyLimit && (
          <p className="muted">
            Leave one of your waiting lobbies before joining another.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Your lobbies</h2>
        {loading && <p className="muted">Loading session…</p>}
        {!loading && !user && (
          <p className="muted">
            Sign in to see the waiting lobbies your account is currently in.
          </p>
        )}
        {!loading && user && (
          <>
            <p className="muted">
              You can be in at most {MAX_ACTIVE_LOBBIES_PER_USER} waiting
              lobbies at once. Admin roles are marked so you can switch between
              them quickly.
            </p>
            <p className="muted">
              Waiting lobby slots used: {myLobbies.length}/
              {MAX_ACTIVE_LOBBIES_PER_USER}.
            </p>
            {loadingMyLobbies && <p className="muted">Loading your lobbies…</p>}
            {!loadingMyLobbies && myLobbies.length === 0 && (
              <p className="emptyState">
                You are not currently in any waiting lobbies.
              </p>
            )}
            {!loadingMyLobbies && myLobbies.length > 0 && (
              <table className="gamesTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Players</th>
                    <th>Visibility</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myLobbies.map((lobby) => {
                    const membership =
                      user &&
                      lobby.players.find(
                        (player) => player.userId === user.userId,
                      );

                    return (
                      <tr key={lobby.id}>
                        <td>{lobby.name}</td>
                        <td>{membership?.isAdmin ? "Admin" : "Player"}</td>
                        <td>
                          {lobbySeatCount(lobby)}/{lobby.maxPlayers}
                        </td>
                        <td>{lobby.isPrivate ? "Private" : "Public"}</td>
                        <td>
                          <div className="buttonRow">
                            <button
                              type="button"
                              className="button buttonSecondary"
                              onClick={() => {
                                setJoinLobbyId(lobby.id);
                                setJoinToken("");
                                void refreshSelectedLobby(lobby.id);
                                revealSelectedLobby();
                              }}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="button buttonSecondary"
                              disabled={busyLeave}
                              onClick={() => void onLeaveLobby(lobby.id)}
                            >
                              {busyLeave ? "Leaving…" : "Leave"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Public lobbies</h2>
        <p className="muted">
          Anyone can browse this list. Select loads details below and does not
          join your account to the lobby.
        </p>
        {loadingPublicLobbies && <p className="muted">Loading…</p>}
        {!loadingPublicLobbies && publicLobbies.length === 0 && (
          <p className="emptyState">No public lobbies available.</p>
        )}
        {!loadingPublicLobbies && publicLobbies.length > 0 && (
          <table className="gamesTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Players</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {publicLobbies.map((lobby) => (
                <tr key={lobby.id}>
                  <td>{lobby.name}</td>
                  <td>
                    {lobbySeatCount(lobby)}/{lobby.maxPlayers}
                  </td>
                  <td>{lobby.status}</td>
                  <td>
                    <button
                      type="button"
                      className="button buttonSecondary"
                      onClick={() => {
                        setJoinLobbyId(lobby.id);
                        setJoinToken("");
                        void refreshSelectedLobby(lobby.id);
                        revealSelectedLobby();
                      }}
                    >
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" ref={selectedLobbyCardRef} id="selected-lobby-room">
        <h2>Selected lobby</h2>
        {!selectedLobby && (
          <p className="emptyState">
            Select a lobby above or create one to view details.
          </p>
        )}
        {selectedLobby && (
          <>
            <dl className="detailsGrid">
              <dt className="muted">Lobby ID</dt>
              <dd>
                <code className="inline">{selectedLobby.id}</code>
              </dd>
              <dt className="muted">Status</dt>
              <dd>{selectedLobby.status}</dd>
              <dt className="muted">Live updates</dt>
              <dd>{lobbyWsStatus}</dd>
              <dt className="muted">Host</dt>
              <dd>{selectedLobby.hostId}</dd>
              <dt className="muted">Visibility</dt>
              <dd>{selectedLobby.isPrivate ? "Private" : "Public"}</dd>
              <dt className="muted">Players</dt>
              <dd>
                {lobbySeatCount(selectedLobby)}/{selectedLobby.maxPlayers}
              </dd>
              <dt className="muted">Your membership</dt>
              <dd>{selectedLobbyMembershipText}</dd>
              <dt className="muted">What you can do</dt>
              <dd>{selectedLobbyActionText}</dd>
            </dl>

            {selectedLobby.isPrivate && isCurrentSubjectAdmin && (
              <>
                <h3 className="subheading">Private invite</h3>
                {!inviteShare || inviteShare.lobbyId !== selectedLobby.id ? (
                  <>
                    <p className="muted">
                      Generate a shareable invite link for this private lobby.
                    </p>
                    <div className="buttonRow">
                      <button
                        type="button"
                        className="button buttonSecondary"
                        onClick={onGenerateInvite}
                        disabled={busyInvite || loading || !user}
                      >
                        {busyInvite ? "Generating…" : "Generate invite link"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="inviteSharePanel">
                    <label
                      className="fieldLabel"
                      htmlFor="selected-invite-link"
                    >
                      Share link
                    </label>
                    <div className="inviteFieldRow">
                      <input
                        id="selected-invite-link"
                        className="textInput"
                        value={inviteShare.url}
                        readOnly
                      />
                      <button
                        type="button"
                        className="button buttonSecondary"
                        onClick={() =>
                          void copyInviteValue(inviteShare.url, "Invite link")
                        }
                      >
                        Copy link
                      </button>
                    </div>

                    <label
                      className="fieldLabel"
                      htmlFor="selected-invite-token"
                    >
                      Invite token
                    </label>
                    <div className="inviteFieldRow">
                      <input
                        id="selected-invite-token"
                        className="textInput"
                        value={inviteShare.token}
                        readOnly
                      />
                      <button
                        type="button"
                        className="button buttonSecondary"
                        onClick={() =>
                          void copyInviteValue(
                            inviteShare.token,
                            "Invite token",
                          )
                        }
                      >
                        Copy token
                      </button>
                    </div>

                    <div className="buttonRow">
                      <button
                        type="button"
                        className="button buttonSecondary"
                        onClick={onGenerateInvite}
                        disabled={busyInvite || loading || !user}
                      >
                        {busyInvite ? "Refreshing…" : "Generate new invite"}
                      </button>
                    </div>
                    <p className="muted">
                      Invite links open this lobby with the token prefilled and
                      currently expire after about{" "}
                      {formatInviteExpiry(inviteShare.expiresInSeconds)}.
                    </p>
                  </div>
                )}
              </>
            )}
            {selectedLobby.isPrivate && !isCurrentSubjectAdmin && (
              <p className="muted">
                Private invite links can only be generated by admins who are
                already in this lobby.
              </p>
            )}

            <h3 className="subheading">Players</h3>
            <ul className="plainList">
              {selectedLobby.players.map((player) => (
                <li key={player.userId}>
                  <code className="inline">{player.userId}</code>
                  {(() => {
                    const labels = formatLobbyPlayerLabels(
                      player,
                      user?.userId,
                    );
                    return labels ? ` (${labels})` : "";
                  })()}
                </li>
              ))}
            </ul>
            {(selectedLobby.aiSlots ?? []).length > 0 && (
              <>
                <h3 className="subheading">AI seats</h3>
                <ul className="plainList">
                  {(selectedLobby.aiSlots ?? []).map((slot) => (
                    <li key={slot.id}>
                      {slot.name} ({slot.personality})
                    </li>
                  ))}
                </ul>
              </>
            )}

            <LobbyReadyControls
              lobby={selectedLobby}
              userId={user?.userId}
              busy={busyStart || busyLeave || busyInvite}
              onUpdated={(updated) => {
                const normalized = normalizeLobby(updated);
                setSelectedLobby(normalized);
                setMyLobbies((current) =>
                  current.map((lobby) =>
                    lobby.id === normalized.id ? normalized : lobby,
                  ),
                );
              }}
              onBusy={setBusyStart}
              onMessage={(text, kind) => setMessage({ text, kind })}
            />

            <div className="buttonRow">
              {selectedLobbyMembership &&
                selectedLobby.status === "waiting" && (
                  <button
                    type="button"
                    className="button buttonSecondary"
                    onClick={() => void onLeaveLobby(selectedLobby.id)}
                    disabled={busyLeave}
                  >
                    {busyLeave ? "Leaving…" : "Leave lobby"}
                  </button>
                )}
              <button
                type="button"
                className="button"
                onClick={onStartLobby}
                disabled={
                  busyStart ||
                  loading ||
                  !user ||
                  !isCurrentSubjectAdmin ||
                  !canStartLobby(
                    selectedLobby.status,
                    lobbySeatCount(selectedLobby),
                    selectedLobby.players,
                  )
                }
              >
                {busyStart ? "Starting…" : "Start game"}
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                onClick={() => void refreshSelectedLobby(selectedLobby.id)}
              >
                Refresh lobby
              </button>
            </div>
            {startLobbyHelpText && (
              <p className="muted">{startLobbyHelpText}</p>
            )}
          </>
        )}
      </div>

      {selectedLobby?.status === "in_game" && (
        <div className="card">
          <h2>Next step</h2>
          {selectedLobby.gameId ? (
            <p>
              Lobby started.{" "}
              <Link to={`/games/${selectedLobby.gameId}`}>Return to game</Link>
            </p>
          ) : (
            <p className="muted">
              Lobby started. Open <Link to="/games">Games</Link> to inspect
              active games.
            </p>
          )}
        </div>
      )}

      {message && (
        <p className={message.kind === "error" ? "errorText" : "ok"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
