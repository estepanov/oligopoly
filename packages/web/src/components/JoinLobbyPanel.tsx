import { Link } from "react-router-dom";

type JoinLobbyPanelProps = {
  lobbyId: string;
  token: string;
  signedIn: boolean;
  signInHref: string;
  waitingLobbyCount: number;
  maxWaitingLobbies: number;
  loading: boolean;
  busy: boolean;
  atLobbyLimit: boolean;
  onLobbyInputChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onLoad: () => void;
  onJoin: () => void;
};

export function JoinLobbyPanel({
  lobbyId,
  token,
  signedIn,
  signInHref,
  waitingLobbyCount,
  maxWaitingLobbies,
  loading,
  busy,
  atLobbyLimit,
  onLobbyInputChange,
  onTokenChange,
  onLoad,
  onJoin,
}: JoinLobbyPanelProps) {
  return (
    <div className="card">
      <h2>Join or load lobby</h2>
      <p className="muted">
        Paste an invite link, invite token, or lobby ID. Loading previews the
        table; joining seats your signed-in account.
      </p>
      <p className="muted">
        {signedIn ? (
          "Public lobbies can be joined directly. Private lobbies require a valid invite token."
        ) : (
          <>
            You are signed out. Loading is available, but joining is disabled
            until you <Link to={signInHref}>sign in</Link>.
          </>
        )}
      </p>
      {signedIn && (
        <p className="muted">
          Waiting lobby slots used: {waitingLobbyCount}/{maxWaitingLobbies}.
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
            value={lobbyId}
            onChange={(event) => onLobbyInputChange(event.target.value)}
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
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>
      <div className="buttonRow">
        <button
          type="button"
          className="button buttonSecondary"
          onClick={onLoad}
          disabled={!lobbyId.trim()}
        >
          Load lobby
        </button>
        <button
          type="button"
          className="button"
          onClick={onJoin}
          disabled={
            busy || loading || !signedIn || atLobbyLimit || !lobbyId.trim()
          }
        >
          {busy ? "Joining..." : "Join lobby"}
        </button>
      </div>
      {signedIn && atLobbyLimit && (
        <p className="muted">
          Leave one of your waiting lobbies before joining another.
        </p>
      )}
    </div>
  );
}
