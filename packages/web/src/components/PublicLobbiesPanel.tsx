import type { LobbyResponse } from "@oligopoly/validation";
import { lobbySeatCount } from "../lib/lobbySeats";

type PublicLobbyListItem = Pick<
  LobbyResponse,
  "id" | "name" | "status" | "maxPlayers" | "players"
> & {
  aiSlots?: LobbyResponse["aiSlots"];
};

type PublicLobbiesPanelProps = {
  lobbies: PublicLobbyListItem[];
  loading: boolean;
  onSelect: (lobbyId: string) => void;
};

export function PublicLobbiesPanel({
  lobbies,
  loading,
  onSelect,
}: PublicLobbiesPanelProps) {
  return (
    <div className="card">
      <h2>Public lobbies</h2>
      <p className="muted">
        Anyone can browse this list. Select loads details below and does not
        join your account until you choose Join lobby.
      </p>
      {loading && <p className="muted">Loading...</p>}
      {!loading && lobbies.length === 0 && (
        <p className="emptyState">No public lobbies available.</p>
      )}
      {!loading && lobbies.length > 0 && (
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
            {lobbies.map((lobby) => (
              <tr key={lobby.id}>
                <td data-label="Name">{lobby.name}</td>
                <td data-label="Players">
                  {lobbySeatCount(lobby)}/{lobby.maxPlayers}
                </td>
                <td data-label="Status">{lobby.status}</td>
                <td data-label="Action">
                  <button
                    type="button"
                    className="button buttonSecondary"
                    onClick={() => onSelect(lobby.id)}
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
  );
}
