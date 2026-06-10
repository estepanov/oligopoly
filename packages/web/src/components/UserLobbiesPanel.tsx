import type { LobbyResponse } from "@oligopoly/validation";
import { lobbySeatCount } from "../lib/lobbySeats";

type LobbyListItem = Pick<
  LobbyResponse,
  "id" | "name" | "maxPlayers" | "isPrivate" | "players"
> & {
  aiSlots?: LobbyResponse["aiSlots"];
};

type UserLobbiesPanelProps = {
  loadingAuth: boolean;
  signedIn: boolean;
  userId: string | undefined;
  lobbies: LobbyListItem[];
  loadingLobbies: boolean;
  busyLeave: boolean;
  maxWaitingLobbies: number;
  onOpen: (lobbyId: string) => void;
  onLeave: (lobbyId: string) => void;
};

export function UserLobbiesPanel({
  loadingAuth,
  signedIn,
  userId,
  lobbies,
  loadingLobbies,
  busyLeave,
  maxWaitingLobbies,
  onOpen,
  onLeave,
}: UserLobbiesPanelProps) {
  return (
    <div className="card">
      <h2>Your lobbies</h2>
      {loadingAuth && <p className="muted">Loading session...</p>}
      {!loadingAuth && !signedIn && (
        <p className="muted">
          Sign in to see the waiting lobbies your account is currently in.
        </p>
      )}
      {!loadingAuth && signedIn && (
        <>
          <p className="muted">
            You can be in at most {maxWaitingLobbies} waiting lobbies at once.
            Admin roles are marked so you can switch between them quickly.
          </p>
          <p className="muted">
            Waiting lobby slots used: {lobbies.length}/{maxWaitingLobbies}.
          </p>
          {loadingLobbies && <p className="muted">Loading your lobbies...</p>}
          {!loadingLobbies && lobbies.length === 0 && (
            <p className="emptyState">
              You are not currently in any waiting lobbies.
            </p>
          )}
          {!loadingLobbies && lobbies.length > 0 && (
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
                {lobbies.map((lobby) => {
                  const membership = lobby.players.find(
                    (player) => player.userId === userId,
                  );

                  return (
                    <tr key={lobby.id}>
                      <td data-label="Name">{lobby.name}</td>
                      <td data-label="Role">
                        {membership?.isAdmin ? "Admin" : "Player"}
                      </td>
                      <td data-label="Players">
                        {lobbySeatCount(lobby)}/{lobby.maxPlayers}
                      </td>
                      <td data-label="Visibility">
                        {lobby.isPrivate ? "Private" : "Public"}
                      </td>
                      <td data-label="Action">
                        <div className="buttonRow">
                          <button
                            type="button"
                            className="button buttonSecondary"
                            onClick={() => onOpen(lobby.id)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="button buttonSecondary"
                            disabled={busyLeave}
                            onClick={() => onLeave(lobby.id)}
                          >
                            {busyLeave ? "Leaving..." : "Leave"}
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
  );
}
