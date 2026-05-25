import type { GameLogEntry } from "@oligopoly/validation";
import { formatGameLogEntry } from "../lib/gameLogDisplay";

type GameActionLogProps = {
  entries: GameLogEntry[];
  tileNames: Map<string, string>;
};

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
          <strong>{formatGameLogEntry(entry, tileNames)}</strong>
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
