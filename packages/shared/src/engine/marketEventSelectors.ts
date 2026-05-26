import { getTilesBySector, SECTOR_IDS } from "../config/board.js";
import type {
  InternalGameState,
  InternalPlayerState,
} from "./gameStateTypes.js";
import { activePlayers } from "./marketEventPrimitives.js";

export function richestPlayerId(state: InternalGameState): string | null {
  let best: InternalPlayerState | null = null;
  for (const player of activePlayers(state)) {
    if (!best || player.capital > best.capital) {
      best = player;
    }
  }
  return best?.playerId ?? null;
}

export function playerWithFewestTiles(
  state: InternalGameState,
): InternalPlayerState | null {
  let best: InternalPlayerState | null = null;
  for (const player of activePlayers(state)) {
    if (
      !best ||
      player.ownedTilePositions.length < best.ownedTilePositions.length
    ) {
      best = player;
    }
  }
  return best;
}

export function playerControllingMostTilesInAnySector(
  state: InternalGameState,
): {
  playerId: string;
  sectorId: string;
  count: number;
} | null {
  let best: { playerId: string; sectorId: string; count: number } | null = null;
  for (const player of activePlayers(state)) {
    for (const sectorId of SECTOR_IDS) {
      const sectorTiles = getTilesBySector(sectorId);
      const owned = sectorTiles.filter((tile) =>
        player.ownedTilePositions.some(
          (pos) => String(pos) === String(tile.position),
        ),
      ).length;
      if (!best || owned > best.count) {
        best = { playerId: player.playerId, sectorId, count: owned };
      }
    }
  }
  return best && best.count > 0 ? best : null;
}
