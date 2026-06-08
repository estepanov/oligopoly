import { getTileByPosition } from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { Fragment } from "react";
import { tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { playerById } from "../lib/gameUi";

type GameBoardPanelProps = {
  state: GameState;
  tileNames: Map<string, string>;
  myPlayerId: string | null;
  actorId: string | null;
};

type PlayerState = NonNullable<GameState["players"]>[number];

type PlayerTableGroup =
  | {
      kind: "syndicate";
      id: string;
      label: string;
      players: PlayerState[];
      totalCapital: number;
      totalHoldings: number;
      totalTiles: number;
    }
  | {
      kind: "independent";
      id: string;
      players: PlayerState[];
    };

function tileMarketValue(position: number | string): number {
  return getTileByPosition(position)?.cost ?? 0;
}

function playerHoldingsValue(player: PlayerState): number {
  return player.ownedTilePositions.reduce<number>(
    (sum, position) => sum + tileMarketValue(position),
    0,
  );
}

function syndicateDisplayName(syndicateId: string, index: number): string {
  const numericSuffix = syndicateId.match(/(\d+)$/)?.[1];
  return numericSuffix
    ? `Syndicate ${numericSuffix}`
    : `Syndicate ${index + 1}`;
}

function buildPlayerTableGroups(state: GameState): PlayerTableGroup[] {
  const players = state.players ?? [];
  const grouped = new Map<
    string,
    Extract<PlayerTableGroup, { kind: "syndicate" }>
  >();
  const groups: PlayerTableGroup[] = [];
  let syndicateIndex = 0;

  for (const player of players) {
    if (!player.syndicateId || !state.syndicates?.[player.syndicateId]) {
      groups.push({
        kind: "independent",
        id: `independent-${player.playerId}`,
        players: [player],
      });
      continue;
    }

    let group = grouped.get(player.syndicateId);
    if (!group) {
      group = {
        kind: "syndicate",
        id: player.syndicateId,
        label: syndicateDisplayName(player.syndicateId, syndicateIndex),
        players: [],
        totalCapital: 0,
        totalHoldings: 0,
        totalTiles: 0,
      };
      grouped.set(player.syndicateId, group);
      groups.push(group);
      syndicateIndex += 1;
    }

    group.players.push(player);
    group.totalCapital += player.capital;
    group.totalHoldings += playerHoldingsValue(player);
    group.totalTiles += player.ownedTilePositions.length;
  }

  return groups;
}

export function GameBoardPanel({
  state,
  tileNames,
  myPlayerId,
  actorId,
}: GameBoardPanelProps) {
  const me = myPlayerId ? playerById(state, myPlayerId) : undefined;
  const playerTableGroups = buildPlayerTableGroups(state);

  return (
    <div className="gameBoardPanel">
      {state.pendingBuyTilePosition !== null &&
        state.pendingBuyTilePosition !== undefined && (
          <p className="gameBoardHighlight">
            Purchase decision:{" "}
            <strong>
              {tileLabel(state.pendingBuyTilePosition, tileNames)}
            </strong>
          </p>
        )}

      {state.pendingAuction && (
        <p className="gameBoardHighlight">
          Auction in progress:{" "}
          <strong>
            {tileLabel(state.pendingAuction.tilePosition, tileNames)}
          </strong>
        </p>
      )}

      {me && (
        <p className="muted">
          You are at <strong>{tileLabel(me.position, tileNames)}</strong> with{" "}
          {formatCurrencyAmount(me.capital, state.settings)} capital and{" "}
          {me.ownedTilePositions.length} owned tile
          {me.ownedTilePositions.length === 1 ? "" : "s"}.
        </p>
      )}

      {state.players && (
        <div className="gameBoardTableWrap">
          <table className="gamesTable gameBoardTable">
            <caption>
              Player standings grouped by syndicate with shared totals.
            </caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Location</th>
                <th scope="col">Capital</th>
                <th scope="col">Tiles</th>
                <th scope="col">Holdings</th>
              </tr>
            </thead>
            <tbody>
              {playerTableGroups.map((group) => (
                <Fragment key={group.id}>
                  {group.kind === "syndicate" && (
                    <tr className="syndicateTotalRow">
                      <th scope="row" data-label="Syndicate">
                        <span className="syndicateTotalName">
                          {group.label}
                        </span>
                        <span className="syndicateTotalMeta">
                          {group.players.length} member
                          {group.players.length === 1 ? "" : "s"} | Admin{" "}
                          {playerDisplayName(
                            state,
                            state.syndicates?.[group.id]?.adminId,
                            { myPlayerId },
                          )}
                        </span>
                      </th>
                      <td data-label="Location">Shared totals</td>
                      <td data-label="Capital">
                        {formatCurrencyAmount(
                          group.totalCapital,
                          state.settings,
                        )}
                      </td>
                      <td data-label="Tiles">{group.totalTiles}</td>
                      <td data-label="Holdings">
                        {formatCurrencyAmount(
                          group.totalHoldings,
                          state.settings,
                        )}
                      </td>
                    </tr>
                  )}
                  {group.players.map((player) => (
                    <tr
                      key={player.playerId}
                      className={[
                        player.playerId === actorId
                          ? "gameBoardCurrentRow"
                          : "",
                        group.kind === "syndicate"
                          ? "gameBoardSyndicateMemberRow"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td data-label="Player">
                        <span className="gameBoardPlayerName">
                          {playerDisplayName(state, player.playerId)}
                          {player.kind === "ai" ? " (AI)" : ""}
                          {player.playerId === myPlayerId ? " (you)" : ""}
                        </span>
                      </td>
                      <td data-label="Location">
                        {tileLabel(player.position, tileNames)}
                      </td>
                      <td data-label="Capital">
                        {formatCurrencyAmount(player.capital, state.settings)}
                      </td>
                      <td data-label="Tiles">
                        {player.ownedTilePositions.length}
                      </td>
                      <td data-label="Holdings">
                        {formatCurrencyAmount(
                          playerHoldingsValue(player),
                          state.settings,
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
