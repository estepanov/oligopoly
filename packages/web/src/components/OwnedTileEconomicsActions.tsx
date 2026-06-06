import type { GameAction, GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
import { getTileEconomics } from "../lib/tileEconomics";
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
  tileNames: Map<string, string>;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function OwnedTileEconomicsActions({
  state,
  tile,
  myPlayerId,
  tileNames,
  busy,
  onAction,
}: OwnedTileEconomicsActionsProps) {
  const economics = getTileEconomics(
    state,
    myPlayerId,
    tile.position,
    myPlayerId,
  );
  const name = tileLabel(tile.position, tileNames);
  const currencySettings = state.settings;

  return (
    <div className="buttonRow">
      {economics.canDevelop && economics.developmentCost !== null && (
        <span className="actionWithInfo">
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() =>
              void onAction(`Developed ${name}`, {
                type: "develop_tile",
                tilePosition: tile.position,
                tokenNumber: economics.nextDevelopmentToken,
              })
            }
          >
            Develop ({economics.formattedDevelopmentCost})
          </button>
          <TileEconomicsExplainDialog
            mode="develop"
            tileName={name}
            economics={economics}
            currencySettings={currencySettings}
            developmentTokensOnTile={tile.developmentTokens}
          />
        </span>
      )}
      {economics.canMortgage && economics.availableMortgageValue !== null && (
        <span className="actionWithInfo">
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() =>
              void onAction(`Mortgaged ${name}`, {
                type: "mortgage_tile",
                tilePosition: tile.position,
              })
            }
          >
            Mortgage (+{economics.formattedAvailableMortgageValue})
          </button>
          <TileEconomicsExplainDialog
            mode="mortgage"
            tileName={name}
            economics={economics}
            currencySettings={currencySettings}
            developmentTokensOnTile={tile.developmentTokens}
          />
        </span>
      )}
      {economics.canRedeem && economics.redemptionCost !== null && (
        <span className="actionWithInfo">
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() =>
              void onAction(`Redeemed ${name}`, {
                type: "redeem_tile",
                tilePosition: tile.position,
              })
            }
          >
            Redeem ({economics.formattedRedemptionCost})
          </button>
          <TileEconomicsExplainDialog
            mode="redeem"
            tileName={name}
            economics={economics}
            currencySettings={currencySettings}
            developmentTokensOnTile={tile.developmentTokens}
          />
        </span>
      )}
    </div>
  );
}
