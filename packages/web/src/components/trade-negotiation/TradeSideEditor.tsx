import type { GameState } from "@oligopoly/validation";
import { formatCurrencyAmount } from "../../lib/gameDisplay";
import type { TradeableTile } from "./types";

export function TradeSideEditor({
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
          name={capitalLabel.toLowerCase().replaceAll(" ", "-")}
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
                name={`${legend.toLowerCase().replaceAll(" ", "-")}-tile`}
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
