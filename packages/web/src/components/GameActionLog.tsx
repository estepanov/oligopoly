import type { GameLogEntry } from "@oligopoly/validation";
import { useMemo } from "react";
import type { CurrencyDisplaySettings } from "../lib/gameDisplay";
import { describeGameLogEntry } from "../lib/gameLogDisplay";
import { InfoDialog } from "./InfoDialog";

type GameActionLogProps = {
  entries: GameLogEntry[];
  tileNames: Map<string, string>;
  currencySymbol?: string;
  currencySettings?: CurrencyDisplaySettings;
  playerNames?: Map<string, string>;
};

const VISIBLE_LOG_ENTRY_LIMIT = 50;

export function GameActionLog({
  entries,
  tileNames,
  currencySymbol = "$",
  currencySettings,
  playerNames,
}: GameActionLogProps) {
  const hiddenEntryCount = Math.max(
    0,
    entries.length - VISIBLE_LOG_ENTRY_LIMIT,
  );
  const displayEntries = useMemo(
    () =>
      entries
        .slice(-VISIBLE_LOG_ENTRY_LIMIT)
        .reverse()
        .map((entry) => ({
          id: entry.id,
          display: describeGameLogEntry(
            entry,
            tileNames,
            currencySettings ?? currencySymbol,
            playerNames,
          ),
        })),
    [currencySettings, currencySymbol, entries, playerNames, tileNames],
  );

  return (
    <section className="gameActionLogPanel" aria-labelledby="action-log-title">
      <div className="gameActionLogHeader">
        <div>
          <h2 id="action-log-title">Action log</h2>
          <p className="gameActionLogHint">Newest first · readable game feed</p>
        </div>
        <InfoDialog
          title="How to read the action log"
          triggerLabel="Explain action log"
        >
          <p>
            The log is an activity feed. The newest action appears at the top,
            and each entry shows the round, time, actor, action, and the most
            important details.
          </p>
          <ul className="helpList">
            <li>
              <strong>Delta</strong> entries explain the actual state change
              after an action, such as cash, action points, position, ownership,
              debt, or trust.
            </li>
            <li>
              <strong>AP</strong> means action points. Players spend AP on
              optional actions like developing, mortgaging, deals, and other
              turn choices.
            </li>
            <li>
              <strong>Property</strong> actions cover buying, developing,
              mortgaging, and redeeming tiles. Development tokens increase rent.
            </li>
            <li>
              <strong>Auctions</strong> may have multiple entries: start, bids
              or passes, tie-breaks, and settlement.
            </li>
            <li>
              <strong>Market</strong> and <strong>Disruption</strong> cards can
              create follow-up cash or state-change entries.
            </li>
          </ul>
        </InfoDialog>
      </div>
      {hiddenEntryCount > 0 && (
        <p className="gameActionLogLimit muted">
          Showing latest {VISIBLE_LOG_ENTRY_LIMIT} of {entries.length} entries.
        </p>
      )}

      {displayEntries.length === 0 ? (
        <div className="gameActionLogEmpty">
          <span className="gameActionLogEmptyMark" aria-hidden="true">
            0
          </span>
          <p>No actions logged yet.</p>
          <p className="muted">
            Rolls, purchases, auctions, rent, cards, and state changes will
            appear here as the game moves.
          </p>
        </div>
      ) : (
        <div
          className="gameActionLog"
          role="feed"
          aria-label="Game activity"
          aria-live="polite"
        >
          {displayEntries.map(({ id, display }) => (
            <article
              key={id}
              className={`gameActionLogItem gameActionLogItem-${display.tone}`}
              aria-label={`${display.headline}, round ${display.round}`}
            >
              <div className="gameActionLogMarker" aria-hidden="true">
                {display.badge}
              </div>
              <div className="gameActionLogBody">
                <div className="gameActionLogTopline">
                  <span className="gameActionLogEyebrow">
                    {display.eyebrow}
                  </span>
                  <span className="gameActionLogMeta">
                    R{display.round} · {display.timeLabel}
                  </span>
                </div>
                <div className="gameActionLogHeadline">
                  <span>{display.actorName ?? "System"}</span>
                  <strong>{display.headline}</strong>
                </div>
                {display.details.length > 0 && (
                  <ul className="gameActionLogDetails">
                    {display.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
                <p className="gameActionLogDescription">
                  {display.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
