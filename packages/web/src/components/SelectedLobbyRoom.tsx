import type { LobbyResponse } from "@oligopoly/validation";
import { Link } from "react-router-dom";
import { canStartLobby, lobbySeatCount } from "../lib/lobbySeats";
import { LobbyLaunchChecklist } from "./LobbyLaunchChecklist";
import { LobbyReadyControls } from "./LobbyReadyControls";
import { LobbyRoster } from "./LobbyRoster";

export type InviteShare = {
  lobbyId: string;
  token: string;
  url: string;
  expiresInSeconds: number;
};

export type SelectedLobbyRoomViewModel = {
  lobby: LobbyResponse | null;
  inviteShare: InviteShare | null;
  isAdmin: boolean;
  membership: LobbyResponse["players"][number] | null;
  membershipText: string;
  actionText: string;
  startHelpText: string | null;
  userId: string | undefined;
  signedIn: boolean;
  loading: boolean;
  lobbyWsStatus: string;
  busyInvite: boolean;
  busyLeave: boolean;
  busyStart: boolean;
};

export type SelectedLobbyRoomActions = {
  onCopyInvite: (value: string, label: string) => void;
  onGenerateInvite: () => void;
  onLeaveLobby: (lobbyId: string) => void;
  onRefreshLobby: (lobbyId: string) => void;
  onStartLobby: () => void;
  onReadyUpdated: (lobby: LobbyResponse) => void;
  onReadyBusy: (busy: boolean) => void;
  onReadyMessage: (text: string, kind: "ok" | "error") => void;
};

type SelectedLobbyRoomProps = {
  view: SelectedLobbyRoomViewModel;
  actions: SelectedLobbyRoomActions;
};

function formatInviteExpiry(expiresInSeconds: number) {
  const expiresInMinutes = Math.max(1, Math.round(expiresInSeconds / 60));
  return `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;
}

export function SelectedLobbyRoom({
  view: {
    lobby,
    inviteShare,
    isAdmin,
    membership,
    membershipText,
    actionText,
    startHelpText,
    userId,
    signedIn,
    loading,
    lobbyWsStatus,
    busyInvite,
    busyLeave,
    busyStart,
  },
  actions: {
    onCopyInvite,
    onGenerateInvite,
    onLeaveLobby,
    onRefreshLobby,
    onStartLobby,
    onReadyUpdated,
    onReadyBusy,
    onReadyMessage,
  },
}: SelectedLobbyRoomProps) {
  if (!lobby) {
    return (
      <p className="emptyState">
        Select a lobby above or create one to view details.
      </p>
    );
  }

  const seatCount = lobbySeatCount(lobby);
  const inviteReady = inviteShare?.lobbyId === lobby.id;

  return (
    <>
      <div className="pageHeader">
        <p className="tagline">
          {lobby.name} is {lobby.isPrivate ? "private" : "public"} with{" "}
          {seatCount}/{lobby.maxPlayers} seats filled.
        </p>
        <p className="muted">{actionText}</p>
      </div>

      <LobbyLaunchChecklist
        lobby={lobby}
        isAdmin={isAdmin}
        isMember={Boolean(membership)}
        signedIn={signedIn}
      />

      {lobby.isPrivate && isAdmin && (
        <>
          <h3 className="subheading">Private invite</h3>
          {!inviteReady ? (
            <>
              <p className="muted">
                Generate a shareable invite link for this private lobby.
              </p>
              <div className="buttonRow">
                <button
                  type="button"
                  className="button buttonSecondary"
                  onClick={onGenerateInvite}
                  disabled={busyInvite || loading || !signedIn}
                >
                  {busyInvite ? "Generating..." : "Generate invite link"}
                </button>
              </div>
            </>
          ) : (
            <div className="inviteSharePanel">
              <label className="fieldLabel" htmlFor="selected-invite-link">
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
                  onClick={() => onCopyInvite(inviteShare.url, "Invite link")}
                >
                  Copy link
                </button>
              </div>

              <label className="fieldLabel" htmlFor="selected-invite-token">
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
                    onCopyInvite(inviteShare.token, "Invite token")
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
                  disabled={busyInvite || loading || !signedIn}
                >
                  {busyInvite ? "Refreshing..." : "Generate new invite"}
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
      {lobby.isPrivate && !isAdmin && (
        <p className="muted">
          Private invite links can only be generated by admins who are already
          in this lobby.
        </p>
      )}

      <LobbyRoster lobby={lobby} viewerId={userId} />

      <LobbyReadyControls
        lobby={lobby}
        userId={userId}
        busy={busyStart || busyLeave || busyInvite}
        onUpdated={onReadyUpdated}
        onBusy={onReadyBusy}
        onMessage={onReadyMessage}
      />

      <div className="buttonRow">
        {membership && lobby.status === "waiting" && (
          <button
            type="button"
            className="button buttonSecondary"
            onClick={() => onLeaveLobby(lobby.id)}
            disabled={busyLeave}
          >
            {busyLeave ? "Leaving..." : "Leave lobby"}
          </button>
        )}
        <button
          type="button"
          className="button"
          onClick={onStartLobby}
          disabled={
            busyStart ||
            loading ||
            !signedIn ||
            !isAdmin ||
            !canStartLobby(lobby.status, seatCount, lobby.players)
          }
        >
          {busyStart ? "Starting..." : "Start game"}
        </button>
        <button
          type="button"
          className="button buttonSecondary"
          onClick={() => onRefreshLobby(lobby.id)}
        >
          Refresh lobby
        </button>
      </div>
      {startHelpText && <p className="muted">{startHelpText}</p>}

      <details className="technicalDetails">
        <summary>Technical details</summary>
        <dl className="detailsGrid">
          <dt className="muted">Lobby ID</dt>
          <dd>
            <code className="inline">{lobby.id}</code>
          </dd>
          <dt className="muted">Status</dt>
          <dd>{lobby.status}</dd>
          <dt className="muted">Live updates</dt>
          <dd>{lobbyWsStatus}</dd>
          <dt className="muted">Host ID</dt>
          <dd>
            <code className="inline">{lobby.hostId}</code>
          </dd>
          <dt className="muted">Your membership</dt>
          <dd>{membershipText}</dd>
        </dl>
      </details>

      {lobby.status === "in_game" && lobby.gameId && (
        <p>
          Lobby started.{" "}
          <Link to={`/games/${lobby.gameId}`}>Return to game</Link>
        </p>
      )}
    </>
  );
}
