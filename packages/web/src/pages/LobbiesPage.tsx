import type { LobbyStatus } from "@oligopoly/validation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  createLobby,
  fetchLobby,
  joinLobby,
  joinLobbyWithToken,
  listPublicLobbies,
  startLobby,
} from "../api/lobbies";

const DEFAULT_MAX_PLAYERS = 4;

type Message = { kind: "ok" | "error"; text: string } | null;

const canStartLobby = (status: LobbyStatus, playerCount: number) =>
  status === "waiting" && playerCount >= 2;

export function LobbiesPage() {
  const [searchParams] = useSearchParams();
  const initialLobbyId = searchParams.get("id")?.trim() ?? "";

  const [subject, setSubject] = useState("user-1");
  const [createName, setCreateName] = useState("New Lobby");
  const [createMaxPlayers, setCreateMaxPlayers] = useState(DEFAULT_MAX_PLAYERS);
  const [createIsPrivate, setCreateIsPrivate] = useState(false);

  const [joinLobbyId, setJoinLobbyId] = useState(initialLobbyId);
  const [joinToken, setJoinToken] = useState("");

  const [loadingPublicLobbies, setLoadingPublicLobbies] = useState(true);
  const [publicLobbies, setPublicLobbies] = useState<
    Awaited<ReturnType<typeof listPublicLobbies>>["lobbies"]
  >([]);
  const [selectedLobby, setSelectedLobby] = useState<Awaited<
    ReturnType<typeof fetchLobby>
  > | null>(null);

  const [busyCreate, setBusyCreate] = useState(false);
  const [busyJoin, setBusyJoin] = useState(false);
  const [busyStart, setBusyStart] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const selectedLobbyId = selectedLobby?.id ?? joinLobbyId;

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

  const refreshSelectedLobby = useCallback(async (id: string) => {
    if (!id) {
      setSelectedLobby(null);
      return;
    }
    try {
      const lobby = await fetchLobby(id);
      setSelectedLobby(lobby);
      setJoinLobbyId(lobby.id);
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
  }, []);

  useEffect(() => {
    void refreshPublicLobbies();
  }, [refreshPublicLobbies]);

  useEffect(() => {
    if (initialLobbyId) {
      void refreshSelectedLobby(initialLobbyId);
    }
  }, [initialLobbyId, refreshSelectedLobby]);

  const isCurrentSubjectAdmin = useMemo(() => {
    if (!selectedLobby) return false;
    return selectedLobby.players.some(
      (player) => player.userId === subject && player.isAdmin,
    );
  }, [selectedLobby, subject]);

  const onCreateLobby = async () => {
    setBusyCreate(true);
    setMessage(null);
    try {
      const lobby = await createLobby(
        {
          name: createName.trim(),
          maxPlayers: createMaxPlayers,
          isPrivate: createIsPrivate,
          optionalRuleIds: [],
        },
        subject,
      );
      setSelectedLobby(lobby);
      setJoinLobbyId(lobby.id);
      setMessage({ kind: "ok", text: `Created lobby ${lobby.id}` });
      await refreshPublicLobbies();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError
            ? `Create failed: ${error.message}`
            : "Create failed",
      });
    } finally {
      setBusyCreate(false);
    }
  };

  const onLoadLobby = async () => {
    setMessage(null);
    await refreshSelectedLobby(joinLobbyId.trim());
  };

  const onJoinLobby = async () => {
    const targetLobbyId = joinLobbyId.trim();
    if (!targetLobbyId) {
      setMessage({ kind: "error", text: "Lobby ID is required." });
      return;
    }

    setBusyJoin(true);
    setMessage(null);
    try {
      const lobby = joinToken.trim()
        ? await joinLobbyWithToken(targetLobbyId, joinToken.trim(), subject)
        : await joinLobby(targetLobbyId, subject);
      setSelectedLobby(lobby);
      setJoinLobbyId(lobby.id);
      setMessage({ kind: "ok", text: `Joined lobby ${lobby.id}` });
      await refreshPublicLobbies();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError
            ? `Join failed: ${error.message}`
            : "Join failed",
      });
    } finally {
      setBusyJoin(false);
    }
  };

  const onStartLobby = async () => {
    if (!selectedLobbyId) return;
    setBusyStart(true);
    setMessage(null);
    try {
      const response = await startLobby(selectedLobbyId, subject);
      await refreshSelectedLobby(selectedLobbyId);
      await refreshPublicLobbies();
      if (response.gameId) {
        setMessage({
          kind: "ok",
          text: `Game started: ${response.gameId}`,
        });
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

  return (
    <div>
      <h1 className="pageTitle">Lobbies</h1>
      <p className="tagline">
        Create, join, and start games through the Worker lobby API.
      </p>

      <div className="card">
        <h2>Session</h2>
        <label className="fieldLabel" htmlFor="subject">
          Acting user (x-subject)
        </label>
        <input
          id="subject"
          className="textInput"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="card">
        <h2>Create lobby</h2>
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
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={createIsPrivate}
            onChange={(e) => setCreateIsPrivate(e.target.checked)}
          />
          Private lobby
        </label>
        <button
          type="button"
          className="button"
          disabled={busyCreate || !subject.trim() || !createName.trim()}
          onClick={onCreateLobby}
        >
          {busyCreate ? "Creating…" : "Create lobby"}
        </button>
      </div>

      <div className="card">
        <h2>Join or load lobby</h2>
        <div className="formGrid">
          <div>
            <label className="fieldLabel" htmlFor="join-id">
              Lobby ID
            </label>
            <input
              id="join-id"
              className="textInput"
              value={joinLobbyId}
              onChange={(e) => setJoinLobbyId(e.target.value)}
              placeholder="Paste lobby id"
            />
          </div>
          <div>
            <label className="fieldLabel" htmlFor="join-token">
              Invite token (private lobbies)
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
            disabled={busyJoin || !subject.trim() || !joinLobbyId.trim()}
          >
            {busyJoin ? "Joining…" : "Join lobby"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Public lobbies</h2>
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
                    {lobby.players.length}/{lobby.maxPlayers}
                  </td>
                  <td>{lobby.status}</td>
                  <td>
                    <button
                      type="button"
                      className="button buttonSecondary"
                      onClick={() => {
                        setJoinLobbyId(lobby.id);
                        void refreshSelectedLobby(lobby.id);
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

      <div className="card">
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
              <dt className="muted">Host</dt>
              <dd>{selectedLobby.hostId}</dd>
              <dt className="muted">Visibility</dt>
              <dd>{selectedLobby.isPrivate ? "Private" : "Public"}</dd>
              <dt className="muted">Players</dt>
              <dd>
                {selectedLobby.players.length}/{selectedLobby.maxPlayers}
              </dd>
            </dl>

            <h3 className="subheading">Players</h3>
            <ul className="plainList">
              {selectedLobby.players.map((player) => (
                <li key={player.userId}>
                  <code className="inline">{player.userId}</code>
                  {player.isAdmin ? " (admin)" : ""}
                </li>
              ))}
            </ul>

            <div className="buttonRow">
              <button
                type="button"
                className="button"
                onClick={onStartLobby}
                disabled={
                  busyStart ||
                  !isCurrentSubjectAdmin ||
                  !canStartLobby(
                    selectedLobby.status,
                    selectedLobby.players.length,
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
            <p className="muted">
              Start is enabled for admins when the lobby is waiting and has at
              least two players.
            </p>
          </>
        )}
      </div>

      {selectedLobby?.status === "in_game" && (
        <div className="card">
          <h2>Next step</h2>
          <p className="muted">
            Lobby started. Open <Link to="/games">Games</Link> to inspect active
            games.
          </p>
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
