import type { GameAction, GameState } from "@oligopoly/validation";
import { getTileEconomics, type TileEconomics } from "../lib/tileEconomics";
import { TileEconomicsExplainDialog } from "./TileEconomicsExplainDialog";

type OwnedTileRow = {
  position: number | string;
  mortgaged: boolean;
  developmentTokens: number;
};

type OwnedTileEconomicsActionsProps = {
  state: GameState;
  tile: OwnedTileRow;
  myPlayerId: string;
  tileName: string;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

type TileEconomicsDialogMode = "develop" | "mortgage" | "redeem";

type OwnedTileActionRow = {
  mode: TileEconomicsDialogMode;
  isEnabled: (economics: TileEconomics) => boolean;
  buttonLabel: (economics: TileEconomics) => string;
  buildLogLabel: (tileName: string) => string;
  buildAction: (
    tilePosition: number | string,
    economics: TileEconomics,
  ) => GameAction;
};

const OWNED_TILE_ACTION_ROWS: OwnedTileActionRow[] = [
  {
    mode: "develop",
    isEnabled: (e) => e.canDevelop && e.developmentCost !== null,
    buttonLabel: (e) => `Develop (${e.formattedDevelopmentCost})`,
    buildLogLabel: (name) => `Developed ${name}`,
    buildAction: (tilePosition, e) => ({
      type: "develop_tile",
      tilePosition,
      tokenNumber: e.nextDevelopmentToken,
    }),
  },
  {
    mode: "mortgage",
    isEnabled: (e) => e.canMortgage && e.availableMortgageValue !== null,
    buttonLabel: (e) => `Mortgage (+${e.formattedAvailableMortgageValue})`,
    buildLogLabel: (name) => `Mortgaged ${name}`,
    buildAction: (tilePosition) => ({
      type: "mortgage_tile",
      tilePosition,
    }),
  },
  {
    mode: "redeem",
    isEnabled: (e) => e.canRedeem && e.redemptionCost !== null,
    buttonLabel: (e) => `Redeem (${e.formattedRedemptionCost})`,
    buildLogLabel: (name) => `Redeemed ${name}`,
    buildAction: (tilePosition) => ({
      type: "redeem_tile",
      tilePosition,
    }),
  },
];

export function OwnedTileEconomicsActions({
  state,
  tile,
  myPlayerId,
  tileName,
  busy,
  onAction,
}: OwnedTileEconomicsActionsProps) {
  const economics = getTileEconomics(
    state,
    myPlayerId,
    tile.position,
    myPlayerId,
  );
  const currencySettings = state.settings;

  return (
    <div className="buttonRow">
      {OWNED_TILE_ACTION_ROWS.map((row) =>
        row.isEnabled(economics) ? (
          <span key={row.mode} className="actionWithInfo">
            <button
              type="button"
              className="button buttonSecondary"
              disabled={busy}
              onClick={() =>
                void onAction(
                  row.buildLogLabel(tileName),
                  row.buildAction(tile.position, economics),
                )
              }
            >
              {row.buttonLabel(economics)}
            </button>
            <TileEconomicsExplainDialog
              mode={row.mode}
              tileName={tileName}
              economics={economics}
              currencySettings={currencySettings}
              developmentTokensOnTile={tile.developmentTokens}
            />
          </span>
        ) : null,
      )}
    </div>
  );
}
