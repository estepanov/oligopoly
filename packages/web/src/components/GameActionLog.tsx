import type { GameLogEntry } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";

type GameActionLogProps = {
  entries: GameLogEntry[];
  tileNames: Map<string, string>;
};

function formatPayload(
  actionType: string,
  payload: unknown,
  tileNames: Map<string, string>,
): string {
  if (payload === null || payload === undefined) {
    return actionType.replaceAll("_", " ");
  }

  if (typeof payload !== "object") {
    return `${actionType}: ${String(payload)}`;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.position === "number" ||
    typeof record.position === "string"
  ) {
    return `${actionType.replaceAll("_", " ")} · ${tileLabel(record.position, tileNames)}`;
  }
  if (typeof record.choice === "string") {
    return `${actionType.replaceAll("_", " ")} · ${record.choice}`;
  }
  if (typeof record.reason === "string") {
    return `${actionType.replaceAll("_", " ")} · ${record.reason}`;
  }

  return actionType.replaceAll("_", " ");
}

export function GameActionLog({ entries, tileNames }: GameActionLogProps) {
  if (entries.length === 0) {
    return <p className="muted">No actions logged yet.</p>;
  }

  return (
    <ol className="gameActionLog">
      {[...entries].reverse().map((entry) => (
        <li key={entry.id} className="gameActionLogItem">
          <span className="gameActionLogMeta">
            {new Date(entry.createdAt).toLocaleTimeString()} · R{entry.round}
          </span>
          <strong>
            {formatPayload(entry.actionType, entry.payload, tileNames)}
          </strong>
          {entry.playerId && (
            <span className="muted">
              {" "}
              · <code className="inline">{entry.playerId}</code>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
