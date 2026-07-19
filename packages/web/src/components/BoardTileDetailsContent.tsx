import type { GameState } from "@oligopoly/validation";
import { useState } from "react";
import type { BoardTileDetails } from "../lib/boardDisplay";
import { occupantLabels } from "../lib/boardOccupants";
import {
  buildTileSetInfo,
  currentDiceTotal,
  currentRentRowId,
  rentScheduleForTile,
  sectorClass,
  sectorDisplayName,
  tileStatusLabel,
  tileTypeLabel,
} from "../lib/boardTileDetails";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { getTileEconomics } from "../lib/tileEconomics";
import { TileEconomicsExplainContent } from "./TileEconomicsExplainContent";

type BoardTileDetailsContentProps = {
  details: BoardTileDetails | undefined;
  occupants: NonNullable<GameState["players"]>;
  occupantsByPosition: Map<string, NonNullable<GameState["players"]>>;
  ownerId: string | null;
  position: number | string;
  state: GameState;
  tileDetails: Map<string, BoardTileDetails>;
  tileState: NonNullable<GameState["tiles"]>[number] | undefined;
  tilesByPosition: Map<string, NonNullable<GameState["tiles"]>[number]>;
  myPlayerId: string | null;
  onSelectSetMember?: (position: number | string) => void;
};

export function BoardTileDetailsContent({
  details,
  occupants,
  occupantsByPosition,
  ownerId,
  position,
  state,
  tileDetails,
  tileState,
  tilesByPosition,
  myPlayerId,
  onSelectSetMember,
}: BoardTileDetailsContentProps) {
  const [viewAnnouncement, setViewAnnouncement] = useState("");
  const currencySettings = state.settings;
  const developmentTokens = tileState?.developmentTokens ?? 0;
  const mortgaged = tileState?.mortgaged ?? false;
  const isMine = ownerId !== null && ownerId === myPlayerId;
  const economics = isMine
    ? getTileEconomics(state, myPlayerId, position, myPlayerId)
    : null;
  const showOwnerActionEconomics =
    isMine && economics !== null && economics.tileCost !== null;
  const rentSchedule = rentScheduleForTile(
    details,
    currentDiceTotal(state) ?? 7,
  );
  const activeRentRowId = currentRentRowId({
    details,
    ownerId,
    state,
    tileState,
  });
  const setInfo = buildTileSetInfo({
    details,
    position,
    state,
    tileDetails,
    tilesByPosition,
    occupantsByPosition,
    myPlayerId,
  });
  const ownerLabel = ownerId
    ? playerDisplayName(state, ownerId, { myPlayerId })
    : "Bank";
  const sectorLabel = details?.sectorId
    ? sectorDisplayName(details.sectorId)
    : null;
  const tileCost =
    details?.cost !== null && details?.cost !== undefined
      ? formatCurrencyAmount(details.cost, currencySettings)
      : "-";
  const baseRent =
    details?.baseRent !== null && details?.baseRent !== undefined
      ? formatCurrencyAmount(details.baseRent, currencySettings)
      : "-";
  const occupantSummary =
    occupants.length > 0
      ? occupantLabels(state, occupants, myPlayerId)
      : "None";
  const statusLabel = tileStatusLabel({
    ownerId,
    mortgaged,
    developmentTokens,
  });
  const tileDetailMetrics = [
    { label: "Position", value: String(position) },
    {
      label: "Type",
      value: details?.type?.replaceAll("_", " ") ?? "board tile",
    },
    ...(sectorLabel ? [{ label: "Sector", value: sectorLabel }] : []),
    { label: "Owner", value: ownerLabel },
    { label: "Cost", value: tileCost },
    { label: "Base rent", value: baseRent },
    {
      label: "Mortgage",
      value: tileState
        ? tileState.mortgaged
          ? "Mortgaged"
          : "Available"
        : "-",
    },
    {
      label: "Development",
      value: `${developmentTokens} token${developmentTokens === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="tileDetailsSurface">
      <div className="visuallyHidden" role="status" aria-live="polite">
        {viewAnnouncement}
      </div>
      <section className="tileDetailsHero">
        <span
          className={`tileDetailsHeroAccent ${sectorClass(details)}`}
          aria-hidden="true"
        />
        <div className="tileDetailsHeroCopy">
          <div className="tileDetailsKicker">
            <span>{tileTypeLabel(details)}</span>
            {sectorLabel && <span>{sectorLabel}</span>}
          </div>
          <p>
            {ownerId
              ? `${ownerLabel} controls this tile.`
              : details?.cost !== null && details?.cost !== undefined
                ? "Available to acquire when landed on."
                : "Board space with no owner."}
          </p>
        </div>
        <div className="tileDetailsHeroStatus">
          <span>{statusLabel}</span>
          <strong>#{position}</strong>
        </div>
      </section>

      <div className="tileDetailsMetrics">
        {tileDetailMetrics.map((metric) => (
          <div key={metric.label} className="tileDetailsMetric">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      {rentSchedule && (
        <section className="tileDetailsSection">
          <div className="tileDetailsSectionHeader">
            <h4>Rent schedule</h4>
            <p>The highlighted row is the rent currently in effect.</p>
          </div>
          <table className="boardRentTable">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">{rentSchedule.conditionHeader}</th>
                <th scope="col">Rent</th>
              </tr>
            </thead>
            <tbody>
              {rentSchedule.rows.map((row) => {
                const isActiveRent = row.id === activeRentRowId;
                return (
                  <tr
                    key={`${row.label}-${row.detail}`}
                    className={isActiveRent ? "boardRentTableCurrent" : ""}
                  >
                    <td>{row.label}</td>
                    <td>{row.detail}</td>
                    <td>
                      {formatCurrencyAmount(row.rent, currencySettings)}
                      {isActiveRent && (
                        <span className="boardRentCurrentBadge">Current</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {setInfo && (
        <section className="tileDetailsSection">
          <div className="tileDetailsSectionHeader">
            <h4>Set membership</h4>
            <p>{setInfo.subtitle}</p>
          </div>
          <div className="boardSetPanel">
            <div className="boardSetHeader">
              <strong>{setInfo.title}</strong>
            </div>
            <ul className="boardSetList">
              {setInfo.members.map((member) => {
                const className = [
                  "boardSetItem",
                  member.selected ? "boardSetItemSelected" : "",
                  member.mortgaged ? "boardSetItemMortgaged" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const body = (
                  <>
                    <span className="boardSetPosition">{member.position}</span>
                    <span className="boardSetMain">
                      <strong>{member.label}</strong>
                      <span>
                        Owned by {member.ownerLabel}
                        {member.occupantLabel
                          ? ` | Players here: ${member.occupantLabel}`
                          : ""}
                      </span>
                    </span>
                    <span className="boardSetStatus">
                      {member.selected ? "Selected" : member.statusLabel}
                    </span>
                  </>
                );

                return (
                  <li key={String(member.position)}>
                    {onSelectSetMember ? (
                      <button
                        type="button"
                        className={className}
                        aria-pressed={member.selected}
                        onClick={() => {
                          if (member.selected) return;
                          setViewAnnouncement(`Viewing ${member.label}`);
                          onSelectSetMember(member.position);
                        }}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {showOwnerActionEconomics && economics && (
        <section className="tileDetailsSection">
          <div className="tileDetailsSectionHeader">
            <h4>Your tile economics</h4>
            <p>Costs, mortgage value, redemption, and development context.</p>
          </div>
          <div className="boardCellEconomicsEmbed">
            <TileEconomicsExplainContent
              mode="property_overview"
              economics={economics}
              currencySettings={currencySettings}
              developmentTokens={tileState?.developmentTokens ?? 0}
              mortgaged={tileState?.mortgaged ?? false}
            />
          </div>
        </section>
      )}

      <section className="tileDetailsSection tileDetailsOccupants">
        <div className="tileDetailsSectionHeader">
          <h4>Occupants</h4>
          <p>{occupantSummary}</p>
        </div>
      </section>
    </div>
  );
}
