import {
  AFFINITY_IDS,
  calculateHubRent,
  calculateSectorTileRent,
  calculateUtilityRent,
  getActiveRateCardMultiplier,
  getTileByPosition,
  getTilesBySector,
  hasPlayerAffinity,
  hasSectorControl,
  type InternalGameState,
  SECTOR_HUB_POSITIONS,
  SECTOR_IDS,
  SECTORS,
  type SectorId,
  tileOwnedByController,
  UTILITY_POSITIONS,
} from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { effectiveAffinityContext } from "../lib/gameUi";
import {
  getTileEconomics,
  mortgageEconomicsLabels,
} from "../lib/tileEconomics";
import { InfoDialog } from "./InfoDialog";
import { TileEconomicsExplainContent } from "./TileEconomicsExplainContent";

type PlayerSummaryPanelProps = {
  state: GameState;
  myPlayerId: string | null;
  tileNames: Map<string, string>;
  actorId?: string | null;
};

type PlayerState = NonNullable<GameState["players"]>[number];

type OwnedTileView = {
  developmentTokens: number;
  economics: ReturnType<typeof getTileEconomics>;
  formattedCurrentRent: string;
  formattedDevelopmentRentIncrease: string | null;
  formattedMortgageValue: string | null;
  mortgageLabel: string;
  mortgaged: boolean;
  name: string;
  position: number | string;
  syndicateSetAvailable: boolean;
};

type AssetSetGroup = {
  id: string;
  label: string;
  meta: string;
  ownedCount: number;
  sortOrder: number;
  totalCount: number;
  totalValue: number;
  tileClassName: string;
  tiles: OwnedTileView[];
};

const HUB_POSITIONS = Object.values(SECTOR_HUB_POSITIONS).map(String);

function developmentTokenTotal(player: PlayerState): number {
  return Object.values(player.developmentTokens).reduce(
    (sum, count) => sum + count,
    0,
  );
}

function playerInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function trustLabel(score: number): string {
  if (score >= 8) return "Strong";
  if (score >= 5) return "Stable";
  return "Fragile";
}

function sectorDisplayName(sectorId: SectorId): string {
  return SECTORS[sectorId].name;
}

function positionSortValue(position: number | string): number {
  if (typeof position === "number") return position;
  const diagonalIndex = Number(position.replace(/^D/, ""));
  return Number.isFinite(diagonalIndex) ? 40 + diagonalIndex : 99;
}

function assetSetForPosition(
  position: number | string,
): Omit<AssetSetGroup, "ownedCount" | "tiles" | "totalValue"> {
  const tile = getTileByPosition(position);

  if (tile?.type === "sector_tile" && tile.sectorId) {
    const sectorIndex = SECTOR_IDS.indexOf(tile.sectorId);
    return {
      id: `sector-${tile.sectorId}`,
      label: sectorDisplayName(tile.sectorId),
      meta: "Sector set",
      sortOrder: sectorIndex >= 0 ? sectorIndex : 20,
      totalCount: getTilesBySector(tile.sectorId).filter(
        (sectorTile) => sectorTile.type === "sector_tile",
      ).length,
      tileClassName: `boardGridSector-${tile.sectorId}`,
    };
  }

  if (tile?.type === "utility") {
    return {
      id: "utilities",
      label: "Utilities",
      meta: "Rent scales together",
      sortOrder: 40,
      totalCount: UTILITY_POSITIONS.length,
      tileClassName: "assetSetUtilities",
    };
  }

  if (tile?.type === "sector_hub") {
    return {
      id: "hubs",
      label: "Hubs",
      meta: "Hub rent ladder",
      sortOrder: 41,
      totalCount: HUB_POSITIONS.length,
      tileClassName: "assetSetHubs",
    };
  }

  return {
    id: "other-assets",
    label: "Other Assets",
    meta: "Owned cards",
    sortOrder: 99,
    totalCount: 1,
    tileClassName: "assetSetOther",
  };
}

function groupOwnedTilesBySet(ownedTiles: OwnedTileView[]): AssetSetGroup[] {
  const groups = new Map<string, AssetSetGroup>();

  for (const tile of ownedTiles) {
    const set = assetSetForPosition(tile.position);
    const group = groups.get(set.id) ?? {
      ...set,
      ownedCount: 0,
      tiles: [],
      totalValue: 0,
    };

    group.ownedCount += 1;
    group.totalValue += tile.economics.tileCost ?? 0;
    group.tiles.push(tile);
    groups.set(group.id, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      tiles: group.tiles.sort(
        (a, b) => positionSortValue(a.position) - positionSortValue(b.position),
      ),
    }))
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
}

function currentDiceTotal(state: GameState): number {
  return state.lastDiceRoll?.length === 2
    ? state.lastDiceRoll[0] + state.lastDiceRoll[1]
    : 7;
}

function controlledTileCount(
  state: GameState,
  ownerId: string,
  positions: Array<number | string>,
): number {
  if (!state.players || !state.tiles) return 0;
  const context = {
    players: state.players,
    syndicates: state.syndicates,
    tiles: state.tiles,
  };

  return positions.filter((position) => {
    const tileState = state.tiles?.find(
      (entry) => String(entry.position) === String(position),
    );
    return (
      tileState?.ownerId &&
      tileOwnedByController(context, ownerId, tileState.ownerId) &&
      !tileState.mortgaged
    );
  }).length;
}

function activeUtilityMultiplier(state: GameState): number | null {
  const modifiers = state.marketEventModifiers;
  if (
    modifiers?.utilityRentMultiplier &&
    modifiers.utilityRentMultiplierUntilRound !== undefined &&
    state.round <= modifiers.utilityRentMultiplierUntilRound
  ) {
    return modifiers.utilityRentMultiplier;
  }
  return null;
}

function setPositionsForTile(
  position: number | string,
): Array<number | string> {
  const boardTile = getTileByPosition(position);

  if (boardTile?.type === "sector_tile" && boardTile.sectorId) {
    return getTilesBySector(boardTile.sectorId)
      .filter((tile) => tile.type === "sector_tile")
      .map((tile) => tile.position);
  }

  if (boardTile?.type === "utility") {
    return [...UTILITY_POSITIONS];
  }

  if (boardTile?.type === "sector_hub") {
    return HUB_POSITIONS;
  }

  return [];
}

function playerOwnedSetCount(
  player: PlayerState,
  positions: Array<number | string>,
): number {
  return positions.filter((position) =>
    player.ownedTilePositions.some(
      (ownedPosition) => String(ownedPosition) === String(position),
    ),
  ).length;
}

function hasSyndicateSetAvailable(
  state: GameState,
  player: PlayerState,
  position: number | string,
): boolean {
  if (!player.syndicateId || !state.syndicates?.[player.syndicateId]) {
    return false;
  }

  const positions = setPositionsForTile(position);
  if (positions.length <= 1) return false;

  const playerCount = playerOwnedSetCount(player, positions);
  const syndicateCount = controlledTileCount(state, player.playerId, positions);
  return playerCount < positions.length && syndicateCount === positions.length;
}

function currentRentForTile({
  developmentTokensOverride,
  ownerId,
  position,
  state,
  viewerPlayerId,
}: {
  developmentTokensOverride?: number;
  ownerId: string;
  position: number | string;
  state: GameState;
  viewerPlayerId: string | null;
}): number | null {
  const boardTile = getTileByPosition(position);
  const tileState = state.tiles?.find(
    (entry) => String(entry.position) === String(position),
  );
  if (!boardTile || boardTile.cost === null) return null;
  if (!tileState?.ownerId || tileState.mortgaged) return 0;

  if (
    boardTile.type === "sector_tile" &&
    boardTile.baseRent !== null &&
    boardTile.sectorId &&
    state.players &&
    state.tiles
  ) {
    const context = {
      players: state.players,
      syndicates: state.syndicates,
      tiles: state.tiles,
    };
    const rateMultiplier = getActiveRateCardMultiplier(
      state as InternalGameState,
      boardTile.sectorId,
      ownerId,
    );

    return calculateSectorTileRent(
      boardTile.baseRent,
      developmentTokensOverride ?? tileState.developmentTokens,
      hasSectorControl(context, ownerId, boardTile.sectorId),
      rateMultiplier,
    );
  }

  if (boardTile.type === "sector_hub") {
    return calculateHubRent(controlledTileCount(state, ownerId, HUB_POSITIONS));
  }

  if (boardTile.type === "utility") {
    const utilityCount = controlledTileCount(state, ownerId, [
      ...UTILITY_POSITIONS,
    ]);
    let rent = calculateUtilityRent(utilityCount, currentDiceTotal(state));
    const utilityMultiplier = activeUtilityMultiplier(state);
    if (utilityMultiplier) rent = Math.floor(rent * utilityMultiplier);

    const affinityContext = effectiveAffinityContext(
      state,
      ownerId,
      viewerPlayerId,
    );
    if (
      utilityCount >= 2 &&
      hasPlayerAffinity(affinityContext, ownerId, AFFINITY_IDS.spectrum_holder)
    ) {
      rent = Math.floor(rent * 1.5);
    }
    return rent;
  }

  return null;
}

function formatRentIncrease(
  amount: number,
  currencySettings: GameState["settings"],
): string {
  return `+${formatCurrencyAmount(amount, currencySettings)} rent`;
}

export function PlayerSummaryPanel({
  state,
  myPlayerId,
  tileNames,
  actorId,
}: PlayerSummaryPanelProps) {
  const players = state.players ?? [];
  const currencySettings = state.settings;

  return (
    <section className="playerSection" aria-labelledby="players-heading">
      <header className="playerSectionHeader">
        <div>
          <p className="eyebrow">Table read</p>
          <h2 id="players-heading">Players</h2>
        </div>
        <p>
          {players.length} player{players.length === 1 ? "" : "s"} | Round{" "}
          {state.round}
        </p>
      </header>

      <ul className="playerSummaryList" aria-label="Player standings">
        {players.map((player) => {
          const mortgaged = player.mortgagedTilePositions.length;
          const tokens = developmentTokenTotal(player);
          const isMe = player.playerId === myPlayerId;
          const isCurrentTurn = player.playerId === actorId;
          const displayName = playerDisplayName(state, player.playerId);
          const locationName = tileLabel(player.position, tileNames);
          const ownedTiles = player.ownedTilePositions.map((position) => {
            const economics = getTileEconomics(
              state,
              player.playerId,
              position,
              myPlayerId,
            );
            const developmentTokens =
              economics.developmentTokens ??
              player.developmentTokens[String(position)] ??
              0;
            const isMortgaged =
              economics.mortgaged ??
              player.mortgagedTilePositions.some(
                (tilePosition) => String(tilePosition) === String(position),
              );
            const {
              label: mortgageLabel,
              formattedValue: formattedMortgageValue,
            } = mortgageEconomicsLabels({
              mortgaged: isMortgaged,
              formattedStoredMortgageValue:
                economics.formattedStoredMortgageValue,
              formattedAvailableMortgageValue:
                economics.formattedAvailableMortgageValue,
            });
            const currentRent = currentRentForTile({
              ownerId: player.playerId,
              position,
              state,
              viewerPlayerId: myPlayerId,
            });
            const nextDevelopmentRent = economics.canDevelop
              ? currentRentForTile({
                  developmentTokensOverride: economics.nextDevelopmentToken,
                  ownerId: player.playerId,
                  position,
                  state,
                  viewerPlayerId: myPlayerId,
                })
              : null;
            const developmentRentIncrease =
              currentRent !== null && nextDevelopmentRent !== null
                ? nextDevelopmentRent - currentRent
                : null;

            return {
              developmentTokens,
              economics,
              formattedCurrentRent:
                currentRent !== null
                  ? formatCurrencyAmount(currentRent, currencySettings)
                  : "N/A",
              formattedDevelopmentRentIncrease:
                developmentRentIncrease !== null
                  ? formatRentIncrease(
                      Math.max(0, developmentRentIncrease),
                      currencySettings,
                    )
                  : null,
              formattedMortgageValue,
              mortgageLabel,
              mortgaged: isMortgaged,
              name: tileLabel(position, tileNames),
              position,
              syndicateSetAvailable: hasSyndicateSetAvailable(
                state,
                player,
                position,
              ),
            };
          });
          const holdingsValue = ownedTiles.reduce(
            (sum, tile) => sum + (tile.economics.tileCost ?? 0),
            0,
          );
          const ownedTileGroups = groupOwnedTilesBySet(ownedTiles);
          const statusFlags = [
            isCurrentTurn ? "Current turn" : null,
            isMe ? "You" : null,
            player.kind === "ai" ? "AI" : null,
            player.inRegulation ? "In regulation" : null,
            (player.outstandingDebt ?? 0) > 0 ? "Debt" : null,
            player.syndicateId ? "Syndicate" : null,
          ].filter((flag): flag is string => flag !== null);

          return (
            <li
              key={player.playerId}
              className={[
                "playerSummaryItem",
                isMe ? "playerSummaryItemMe" : "",
                isCurrentTurn ? "playerSummaryItemActive" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="playerSummaryTop">
                <div className="playerIdentity">
                  <span className="playerAvatar" aria-hidden="true">
                    {playerInitial(displayName)}
                  </span>
                  <div className="playerIdentityCopy">
                    <h3>
                      {displayName}
                      {isMe ? " (you)" : ""}
                    </h3>
                    <ul
                      className="playerStatusPills"
                      aria-label={`${displayName} status`}
                    >
                      {statusFlags.length > 0 ? (
                        statusFlags.map((flag) => (
                          <li key={flag} className="playerStatusPill">
                            {flag}
                          </li>
                        ))
                      ) : (
                        <li className="playerStatusPill">Clear</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="playerCapitalBlock">
                  <span>Capital</span>
                  <strong>
                    {formatCurrencyAmount(player.capital, currencySettings)}
                  </strong>
                </div>
              </div>

              <dl className="playerMetricGrid">
                <div className="playerMetric playerMetricWide">
                  <dt>Location</dt>
                  <dd>{locationName}</dd>
                </div>
                <div className="playerMetric">
                  <dt>AP</dt>
                  <dd>{player.actionPointsRemaining}</dd>
                </div>
                <div className="playerMetric">
                  <dt>Assets</dt>
                  <dd>{player.ownedTilePositions.length}</dd>
                </div>
                <div className="playerMetric">
                  <dt>Holdings</dt>
                  <dd>
                    {formatCurrencyAmount(holdingsValue, currencySettings)}
                  </dd>
                </div>
                <div className="playerMetric">
                  <dt>Developed</dt>
                  <dd>{tokens}</dd>
                </div>
                <div className="playerMetric">
                  <dt>Mortgaged</dt>
                  <dd>{mortgaged}</dd>
                </div>
                <div className="playerMetric playerMetricWide">
                  <dt>Trust</dt>
                  <dd>
                    <span>{player.trustworthiness}/10</span>
                    <span className="playerTrustMeter" aria-hidden="true">
                      <span
                        style={{
                          inlineSize: `${Math.max(
                            0,
                            Math.min(100, player.trustworthiness * 10),
                          )}%`,
                        }}
                      />
                    </span>
                    <span>{trustLabel(player.trustworthiness)}</span>
                  </dd>
                </div>
              </dl>

              {((player.outstandingDebt ?? 0) > 0 ||
                player.inRegulation ||
                player.syndicateId) && (
                <dl className="playerAlertGrid">
                  {(player.outstandingDebt ?? 0) > 0 && (
                    <div>
                      <dt>Debt</dt>
                      <dd>
                        {formatCurrencyAmount(
                          player.outstandingDebt ?? 0,
                          currencySettings,
                        )}
                      </dd>
                    </div>
                  )}
                  {player.inRegulation && (
                    <div>
                      <dt>Regulation</dt>
                      <dd>Serving penalty</dd>
                    </div>
                  )}
                  {player.syndicateId && (
                    <div>
                      <dt>Syndicate</dt>
                      <dd>
                        <code className="inline">{player.syndicateId}</code>
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              <section
                className="playerAssetsPanel"
                aria-labelledby={`player-assets-${player.playerId}`}
              >
                <div className="playerAssetsHeader">
                  <h4 id={`player-assets-${player.playerId}`}>Assets</h4>
                  <span>
                    {ownedTiles.length} owned | {ownedTileGroups.length} set
                    {ownedTileGroups.length === 1 ? "" : "s"} | {mortgaged}{" "}
                    mortgaged
                  </span>
                </div>

                {ownedTiles.length > 0 ? (
                  <ul
                    className="assetSetList"
                    aria-label={`${displayName} owned properties grouped by set`}
                  >
                    {ownedTileGroups.map((group) => (
                      <li key={group.id} className="assetSetGroup">
                        <div
                          className={[
                            "assetSetHeader",
                            group.tileClassName,
                            group.ownedCount === group.totalCount
                              ? "assetSetHeaderComplete"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <span className="assetSetColor" aria-hidden="true" />
                          <div className="assetSetTitle">
                            <strong>{group.label}</strong>
                            <span>
                              {group.ownedCount} of {group.totalCount} owned
                              {group.ownedCount === group.totalCount
                                ? " | Complete set"
                                : ""}
                            </span>
                          </div>
                          <div className="assetSetValue">
                            <span>{group.meta}</span>
                            <strong>
                              {formatCurrencyAmount(
                                group.totalValue,
                                currencySettings,
                              )}
                            </strong>
                          </div>
                        </div>
                        <ul className="propertyList">
                          {group.tiles.map((tile) => (
                            <li
                              key={String(tile.position)}
                              className={[
                                "propertyListItem",
                                tile.mortgaged
                                  ? "propertyListItemMortgaged"
                                  : "",
                                tile.syndicateSetAvailable
                                  ? "propertyListItemSyndicateSet"
                                  : "",
                                tile.developmentTokens > 0
                                  ? "propertyListItemImproved"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <div className="propertyListMain">
                                <strong>{tile.name}</strong>
                                <span className="propertyMeta">
                                  {tile.mortgaged ? "Mortgaged" : "Active"}
                                  {tile.developmentTokens > 0
                                    ? ` | ${tile.developmentTokens} development token${
                                        tile.developmentTokens === 1 ? "" : "s"
                                      }`
                                    : ""}
                                  {tile.syndicateSetAvailable && (
                                    <span className="propertySetBadge">
                                      Syndicate set available
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="propertyEconomics">
                                <span className="propertyEconomicsPair">
                                  <span>Rent</span>
                                  <strong>{tile.formattedCurrentRent}</strong>
                                </span>
                                <span className="propertyEconomicsPair">
                                  <span>Develop</span>
                                  <strong>
                                    {tile.economics.formattedDevelopmentCost ??
                                      "N/A"}
                                  </strong>
                                  {tile.formattedDevelopmentRentIncrease && (
                                    <em>
                                      {tile.formattedDevelopmentRentIncrease}
                                    </em>
                                  )}
                                </span>
                                <span className="propertyEconomicsPair">
                                  <span>{tile.mortgageLabel}</span>
                                  <strong>
                                    {tile.formattedMortgageValue ?? "N/A"}
                                  </strong>
                                </span>
                                <InfoDialog
                                  title={`${tile.name} economics`}
                                  triggerLabel={`Explain develop and mortgage numbers for ${tile.name}`}
                                >
                                  <TileEconomicsExplainContent
                                    mode="property_overview"
                                    economics={tile.economics}
                                    currencySettings={currencySettings}
                                    developmentTokens={tile.developmentTokens}
                                    mortgaged={tile.mortgaged}
                                  />
                                </InfoDialog>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="playerAssetsEmpty">No owned tiles yet.</p>
                )}
              </section>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
