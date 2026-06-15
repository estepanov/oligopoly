import {
  getTileByPosition,
  listTradeableTilePositions,
  tradeTransferValue,
} from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../../lib/boardDisplay";
import type { TradeableTile, TradeOffer } from "./types";

export function tradeableTilesForPlayer(
  state: GameState,
  playerId: string,
  tileNames: Map<string, string>,
): TradeableTile[] {
  // Delegate the eligibility contract (owned + not mortgaged + not blocked by an
  // active `sell_tile` contract) to the engine's canonical
  // `listTradeableTilePositions` so the UI never offers a tile the engine would
  // reject on propose. The web layer only maps positions → display labels/values.
  return listTradeableTilePositions(state, playerId).map((position) => ({
    position: String(position),
    name: tileLabel(position, tileNames),
    value: getTileByPosition(position)?.cost ?? 0,
  }));
}

export function selectedTransferValue(
  selectedPositions: string[],
  capital: number,
): number {
  return tradeTransferValue({
    capital,
    tilePositions: selectedPositions,
  });
}

/**
 * Parse a capital input into a non-negative integer. Returns `NaN` for
 * non-finite input so callers can reject it explicitly with `Number.isFinite`.
 */
export function parseCapital(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.max(0, Math.floor(parsed));
}

export function tradeStatusLabel(status: TradeOffer["status"]): string {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    case "countered":
      return "Countered";
    case "pending":
      return "Pending";
  }
}
