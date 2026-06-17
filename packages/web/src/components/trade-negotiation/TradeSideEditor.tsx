import type { GameState } from "@oligopoly/validation";
import { formatCurrencyAmount } from "../../lib/gameDisplay";
import type { TradeableTile } from "./types";

export function TradeSideEditor({
  fieldId,
  legend,
  capitalLabel,
  capitalValue,
  tiles,
  selectedPositions,
  totalValue,
  currencySettings,
  disabled,
  emptyText = "No tradeable properties",
  onCapitalChange,
  onToggleTile,
}: {
  /** Stable, collision-free prefix for this editor's form-field `name`s. */
  fieldId: string;
  legend: string;
  capitalLabel: string;
  capitalValue: string;
  tiles: TradeableTile[];
  selectedPositions: string[];
  totalValue: number;
  currencySettings: GameState["settings"];
  disabled: boolean;
  emptyText?: string;
  onCapitalChange: (value: string) => void;
  onToggleTile: (position: string) => void;
}) {
  return (
    <fieldset className="tradeSide">
      <legend>{legend}</legend>
      <label className="tradeField">
        {capitalLabel}
        <input
          name={`${fieldId}-capital`}
          type="number"
          min="0"
          step="1"
          value={capitalValue}
          disabled={disabled}
          onChange={(event) => onCapitalChange(event.target.value)}
        />
      </label>
      <div className="tradeAssetList">
        {tiles.length === 0 ? (
          <span className="muted">{emptyText}</span>
        ) : (
          tiles.map((tile) => (
            <label key={tile.position} className="tradeAssetChip">
              <input
                name={`${fieldId}-tile`}
                type="checkbox"
                checked={selectedPositions.includes(tile.position)}
                disabled={disabled}
                onChange={() => onToggleTile(tile.position)}
              />
              <span>
                <strong>{tile.name}</strong>
                <small>
                  {formatCurrencyAmount(tile.value, currencySettings)}
                </small>
              </span>
            </label>
          ))
        )}
      </div>
      <span className="tradeSideTotal">
        Total {formatCurrencyAmount(totalValue, currencySettings)}
      </span>
    </fieldset>
  );
}
