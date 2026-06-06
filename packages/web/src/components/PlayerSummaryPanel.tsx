import type { GameState } from "@oligopoly/validation";
import { type BoardTileDetails, tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { getTileEconomics } from "../lib/tileEconomics";
import { InfoDialog } from "./InfoDialog";

type PlayerSummaryPanelProps = {
  state: GameState;
  myPlayerId: string | null;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
};

export function PlayerSummaryPanel({
  state,
  myPlayerId,
  tileNames,
}: PlayerSummaryPanelProps) {
  const players = state.players ?? [];
  const currencySettings = state.settings;

  return (
    <div className="card">
      <h2>Players</h2>
      <ul className="playerSummaryList">
        {players.map((player) => {
          const mortgaged = player.mortgagedTilePositions.length;
          const tokens = Object.values(player.developmentTokens).reduce(
            (sum, count) => sum + count,
            0,
          );
          const isMe = player.playerId === myPlayerId;

          return (
            <li key={player.playerId} className="playerSummaryItem">
              <strong>
                {playerDisplayName(state, player.playerId)}
                {isMe ? " (you)" : ""}
              </strong>
              <dl className="detailsGrid">
                <dt className="muted">Capital</dt>
                <dd>
                  {formatCurrencyAmount(player.capital, currencySettings)}
                </dd>
                <dt className="muted">Tiles owned</dt>
                <dd>{player.ownedTilePositions.length}</dd>
                <dt className="muted">Mortgaged</dt>
                <dd>{mortgaged}</dd>
                <dt className="muted">Development tokens</dt>
                <dd>{tokens}</dd>
                <dt className="muted">Trustworthiness</dt>
                <dd>{player.trustworthiness}</dd>
                {player.syndicateId && (
                  <>
                    <dt className="muted">Syndicate</dt>
                    <dd>
                      <code className="inline">{player.syndicateId}</code>
                    </dd>
                  </>
                )}
                {(player.outstandingDebt ?? 0) > 0 && isMe && (
                  <>
                    <dt className="muted">Debt</dt>
                    <dd>
                      {formatCurrencyAmount(
                        player.outstandingDebt ?? 0,
                        currencySettings,
                      )}
                    </dd>
                  </>
                )}
                {player.inRegulation && (
                  <>
                    <dt className="muted">Regulation</dt>
                    <dd>Serving penalty</dd>
                  </>
                )}
              </dl>
              {player.ownedTilePositions.length > 0 && (
                <ul className="propertyList" aria-label="Owned properties">
                  {player.ownedTilePositions.map((position) => {
                    const economics = getTileEconomics(
                      state,
                      isMe ? player.playerId : null,
                      position,
                    );
                    const developmentTokens =
                      economics.developmentTokens ??
                      player.developmentTokens[String(position)] ??
                      0;
                    const mortgaged =
                      economics.mortgaged ??
                      player.mortgagedTilePositions.some(
                        (tilePosition) =>
                          String(tilePosition) === String(position),
                      );
                    const propertyName = tileLabel(position, tileNames);
                    const mortgageLabel = mortgaged
                      ? "Stored mortgage value"
                      : "Mortgage gain";
                    const formattedMortgageValue = mortgaged
                      ? economics.formattedStoredMortgageValue
                      : economics.formattedAvailableMortgageValue;

                    return (
                      <li key={String(position)} className="propertyListItem">
                        <div>
                          <strong>{propertyName}</strong>
                          <span className="propertyMeta">
                            {mortgaged ? "Mortgaged" : "Active"}
                            {developmentTokens > 0
                              ? ` · ${developmentTokens} development token${developmentTokens === 1 ? "" : "s"}`
                              : ""}
                          </span>
                        </div>
                        <div className="propertyEconomics">
                          <span>
                            Develop:{" "}
                            {economics.formattedDevelopmentCost ??
                              "not available"}
                          </span>
                          <span>
                            {mortgageLabel}:{" "}
                            {formattedMortgageValue ?? "not available"}
                          </span>
                          <InfoDialog
                            title={`${propertyName} economics`}
                            triggerLabel={`Explain develop and mortgage numbers for ${propertyName}`}
                          >
                            {economics.formattedTileCost && (
                              <div className="economicsCallout">
                                <span className="economicsLabel">
                                  Tile value
                                </span>
                                <strong>{economics.formattedTileCost}</strong>
                              </div>
                            )}
                            <dl className="detailsGrid">
                              <dt className="muted">Current development</dt>
                              <dd>
                                {developmentTokens} of{" "}
                                {economics.maxDevelopmentTokens} tokens
                              </dd>
                              <dt className="muted">Next token</dt>
                              <dd>
                                {economics.formattedDevelopmentCost ??
                                  "Not available while mortgaged or capped"}
                              </dd>
                              <dt className="muted">{mortgageLabel}</dt>
                              <dd>
                                {formattedMortgageValue ?? "Not available"}
                              </dd>
                              {economics.syntheticCdoActive &&
                                !mortgaged &&
                                economics.availableMortgageValue !== null &&
                                economics.standardMortgageValue !== null && (
                                  <>
                                    <dt className="muted">
                                      Synthetic CDO bonus
                                    </dt>
                                    <dd>
                                      +
                                      {formatCurrencyAmount(
                                        economics.availableMortgageValue -
                                          economics.standardMortgageValue,
                                        currencySettings,
                                      )}
                                    </dd>
                                  </>
                                )}
                              <dt className="muted">Mortgage rate</dt>
                              <dd>
                                {Math.round(
                                  (mortgaged
                                    ? economics.storedMortgageRate
                                    : economics.availableMortgageRate) * 100,
                                )}
                                %
                              </dd>
                              <dt className="muted">Redeem cost</dt>
                              <dd>
                                {economics.formattedRedemptionCost ??
                                  "Not available"}
                              </dd>
                            </dl>
                            <p>
                              Mortgage and development values are calculated
                              from this tile's current state and visible
                              modifiers. Mortgaged tiles keep tokens visible but
                              cannot collect rent or be developed until
                              redeemed.
                            </p>
                          </InfoDialog>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
