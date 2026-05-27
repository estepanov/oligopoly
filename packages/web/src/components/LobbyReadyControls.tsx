import type { LobbyResponse } from "@oligopoly/validation";
import { clearLobbyReady, setLobbyReady } from "../api/lobbies";

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
      <ul className="plainList muted">
        {lobby.players.map((player) => (
          <li key={player.userId}>
            <code className="inline">{player.userId}</code>
            {player.isReady ? " — ready" : " — not ready"}
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
