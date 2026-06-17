import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../../lib/boardDisplay";
import { formatCurrencyAmount } from "../../lib/gameDisplay";
import type { TradeOffer } from "./types";

export function TradeOfferSide({
  label,
  transfer,
  state,
  tileNames,
}: {
  label: string;
  transfer: TradeOffer["gives"];
  state: GameState;
  tileNames: Map<string, string>;
}) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <p>
        {formatCurrencyAmount(transfer.capital, state.settings)}
        {transfer.tilePositions.length > 0
          ? ` + ${transfer.tilePositions
              .map((position) => tileLabel(position, tileNames))
              .join(", ")}`
          : ""}
      </p>
    </div>
  );
}
