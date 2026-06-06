import type { GameLogEntry } from "@oligopoly/validation";
import type { CurrencyDisplaySettings } from "../lib/gameDisplay";
import { formatGameLogEntry } from "../lib/gameLogDisplay";

type GameActionLogProps = {
  entries: GameLogEntry[];
  tileNames: Map<string, string>;
  currencySymbol?: string;
  currencySettings?: CurrencyDisplaySettings;
  playerNames?: Map<string, string>;
};

export function GameActionLog({
  entries,
  tileNames,
  currencySymbol = "$",
  currencySettings,
  playerNames,
}: GameActionLogProps) {
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
            {formatGameLogEntry(
              entry,
              tileNames,
              currencySettings ?? currencySymbol,
              playerNames,
            )}
          </strong>
          {entry.playerId && (
            <span className="muted">
              {" "}
              · {playerNames?.get(entry.playerId) ?? entry.playerId}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
