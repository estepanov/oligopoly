import type { LobbyResponse } from "@oligopoly/validation";
import { canStartLobby, lobbySeatCount } from "../lib/lobbySeats";

type LobbyLaunchChecklistProps = {
  lobby: LobbyResponse;
  isAdmin: boolean;
  isMember: boolean;
  signedIn: boolean;
};

type ChecklistItem = {
  label: string;
  detail: string;
  complete: boolean;
};

function buildChecklist({
  lobby,
  isAdmin,
  isMember,
  signedIn,
}: LobbyLaunchChecklistProps): ChecklistItem[] {
  const seatCount = lobbySeatCount(lobby);
  const canStart = canStartLobby(lobby.status, seatCount, lobby.players);
  const allHumansReady =
    lobby.players.length > 0 && lobby.players.every((player) => player.isReady);

  return [
    {
      label: "Join the table",
      detail: signedIn
        ? "Your account must be seated before you can ready or play."
        : "Sign in before joining this lobby.",
      complete: isMember,
    },
    {
      label: "Fill at least two seats",
      detail: "Two total human or AI seats are required before start.",
      complete: seatCount >= 2,
    },
    {
      label: "Ready every human",
      detail: "AI seats are automatically ready; humans confirm when set.",
      complete: allHumansReady,
    },
    {
      label: "Host starts the game",
      detail: isAdmin
        ? "Start unlocks when the table is ready."
        : "Only the host or a co-admin can start.",
      complete: isAdmin && canStart,
    },
  ];
}

export function LobbyLaunchChecklist(props: LobbyLaunchChecklistProps) {
  const items = buildChecklist(props);

  return (
    <ul className="lobbyLaunchChecklist" aria-label="Lobby launch checklist">
      {items.map((item) => (
        <li
          className={
            item.complete
              ? "lobbyLaunchChecklistItem lobbyLaunchChecklistItemComplete"
              : "lobbyLaunchChecklistItem"
          }
          key={item.label}
          aria-label={`${item.label}: ${
            item.complete ? "complete" : "incomplete"
          }. ${item.detail}`}
        >
          <span aria-hidden="true">{item.complete ? "✓" : "·"}</span>
          <div>
            <strong>{item.label}</strong>
            <p className="muted">{item.detail}</p>
            <span className="srOnly">
              {item.complete ? "Complete" : "Incomplete"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
