import { getTileByPosition, tradeTransferValue } from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { tileLabel } from "../../lib/boardDisplay";
import { playerById, tileStateByPosition } from "../../lib/gameUi";
import type { TradeableTile, TradeOffer } from "./types";

export function tradeableTilesForPlayer(
  state: GameState,
  playerId: string,
  tileNames: Map<string, string>,
): TradeableTile[] {
  const player = playerById(state, playerId);
  if (!player) return [];
  return player.ownedTilePositions.flatMap((position) => {
    const tile = tileStateByPosition(state, position);
    if (!tile || tile.ownerId !== playerId || tile.mortgaged) return [];
    const cost = getTileByPosition(position)?.cost ?? 0;
    return [
      {
        position: String(position),
        name: tileLabel(position, tileNames),
        value: cost,
      },
    ];
  });
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

export function parseCapital(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return -1;
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
