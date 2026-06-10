import type { LobbyResponse } from "@oligopoly/validation";
import {
  lobbyPlayerLabel,
  lobbyPlayerRole,
  sortedLobbyPlayers,
} from "../lib/lobbyDisplay";

type LobbyRosterProps = {
  lobby: LobbyResponse;
  viewerId: string | undefined;
};

export function LobbyRoster({ lobby, viewerId }: LobbyRosterProps) {
  return (
    <div className="lobbyRoster">
      <h3 className="subheading">Seats</h3>
      <ul className="plainList lobbyRosterList">
        {sortedLobbyPlayers(lobby.players).map((player, index) => (
          <li key={player.userId}>
            <div>
              <strong>{lobbyPlayerLabel(player, index, viewerId)}</strong>
              <span className="muted">
                Human seat {index + 1} · {lobbyPlayerRole(player)}
              </span>
            </div>
            <span className={player.isReady ? "ok" : "muted"}>
              {player.isReady ? "Ready" : "Not ready"}
            </span>
          </li>
        ))}
        {(lobby.aiSlots ?? []).map((slot, index) => (
          <li key={slot.id}>
            <div>
              <strong>{slot.name || `AI ${index + 1}`}</strong>
              <span className="muted">{slot.personality} AI seat</span>
            </div>
            <span className="ok">Ready</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
