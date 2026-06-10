import type { LobbyResponse } from "@oligopoly/validation";
import { clearLobbyReady, setLobbyReady } from "../api/lobbies";
import {
  lobbyPlayerLabel,
  lobbyPlayerRole,
  sortedLobbyPlayers,
} from "../lib/lobbyDisplay";

type LobbyReadyControlsProps = {
  lobby: LobbyResponse;
  userId: string | undefined;
  busy: boolean;
  onUpdated: (lobby: LobbyResponse) => void;
  onBusy: (busy: boolean) => void;
  onMessage: (text: string, kind: "ok" | "error") => void;
};

export function LobbyReadyControls({
  lobby,
  userId,
  busy,
  onUpdated,
  onBusy,
  onMessage,
}: LobbyReadyControlsProps) {
  if (lobby.status !== "waiting" || !userId) return null;

  const me = lobby.players.find((player) => player.userId === userId);
  if (!me) return null;

  const allHumansReady = lobby.players.every((player) => player.isReady);
  const toggleReady = async () => {
    onBusy(true);
    try {
      const updated = me.isReady
        ? await clearLobbyReady(lobby.id)
        : await setLobbyReady(lobby.id);
      onUpdated({ ...updated, aiSlots: updated.aiSlots ?? [] });
      onMessage(
        updated.players.find((player) => player.userId === userId)?.isReady
          ? "You are ready to start."
          : "Ready status cleared.",
        "ok",
      );
    } catch {
      onMessage("Could not update ready status.", "error");
    } finally {
      onBusy(false);
    }
  };

  return (
    <div className="cardNested">
      <h3>Ready check</h3>
      <p className="muted">
        {allHumansReady
          ? "All players are ready. An admin can start the game."
          : "Every human player must mark ready before the admin can start."}
      </p>
      <ul className="plainList muted lobbyRosterList">
        {sortedLobbyPlayers(lobby.players).map((player, index) => (
          <li key={player.userId}>
            <div>
              <strong>{lobbyPlayerLabel(player, index, userId)}</strong>
              <span>{lobbyPlayerRole(player)}</span>
            </div>
            <span className={player.isReady ? "ok" : "muted"}>
              {player.isReady ? "Ready" : "Not ready"}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="button buttonSecondary"
        disabled={busy}
        onClick={() => void toggleReady()}
      >
        {me.isReady ? "Clear ready" : "Mark ready"}
      </button>
    </div>
  );
}
