import { getTileByPosition, SECTOR_HUB_POSITIONS } from "../config/board.js";
import {
  calculateAffinityRentBonus,
  spectrumHolderUtilityMultiplier,
} from "./affinity.js";
import type { InternalGameState } from "./gameStateTypes.js";
import { isOptionalRuleEnabled } from "./optionalRulesEngine.js";
import { getActiveRateCardMultiplier } from "./rateCards.js";
import {
  calculateHubRent,
  calculateSectorTileRent,
  calculateUtilityRent,
} from "./rent.js";
import {
  hasSectorControl,
  ownsHubForSector,
  tileOwnedByController,
  visitorControlsSector,
} from "./syndicate.js";

export function countHubsOwned(
  state: InternalGameState,
  playerId: string,
): number {
  return Object.values(SECTOR_HUB_POSITIONS).filter((pos) => {
    const tileState = state.tiles.find((tile) => tile.position === pos);
    return (
      tileState?.ownerId &&
      tileOwnedByController(state, playerId, tileState.ownerId) &&
      !tileState.mortgaged
    );
  }).length;
}

export function countUtilitiesOwned(
  state: InternalGameState,
  playerId: string,
): number {
  return [12, 28].filter((pos) => {
    const tileState = state.tiles.find((tile) => tile.position === pos);
    return (
      tileState?.ownerId &&
      tileOwnedByController(state, playerId, tileState.ownerId) &&
      !tileState.mortgaged
    );
  }).length;
}

export function computeTileRent(
  state: InternalGameState,
  position: number | string,
  visitorId: string,
): { rent: number; ownerId: string | null } {
  const tile = getTileByPosition(position);
  if (!tile || tile.cost === null) return { rent: 0, ownerId: null };

  const tileState = state.tiles.find(
    (entry) => String(entry.position) === String(position),
  );
  if (!tileState?.ownerId || tileState.mortgaged) {
    return { rent: 0, ownerId: null };
  }

  const ownerId = tileState.ownerId;

  if (tile.type === "sector_hub") {
    return { rent: calculateHubRent(countHubsOwned(state, ownerId)), ownerId };
  }

  if (tile.type === "utility") {
    const utilCount = countUtilitiesOwned(state, ownerId);
    const diceTotal = state.lastDiceRoll
      ? state.lastDiceRoll[0] + state.lastDiceRoll[1]
      : 7;
    let rent = calculateUtilityRent(utilCount, diceTotal);
    const spectrumMultiplier = spectrumHolderUtilityMultiplier(
      state,
      ownerId,
      utilCount,
    );
    if (spectrumMultiplier) {
      rent = Math.floor(rent * spectrumMultiplier);
    }
    return { rent, ownerId };
  }

  if (tile.type === "sector_tile" && tile.baseRent !== null && tile.sectorId) {
    const sectorCtrl = hasSectorControl(state, ownerId, tile.sectorId);
    const devTokens = tileState.developmentTokens;
    let sectorControlMultiplier: number | undefined;
    if (
      isOptionalRuleEnabled(state.settings, "double_rent_district") &&
      sectorCtrl &&
      devTokens === 0 &&
      ownsHubForSector(state, ownerId, tile.sectorId) &&
      !visitorControlsSector(state, visitorId, tile.sectorId)
    ) {
      sectorControlMultiplier = 3;
    }
    const rateMultiplier = tile.sectorId
      ? getActiveRateCardMultiplier(state, tile.sectorId, ownerId)
      : undefined;
    return {
      rent: calculateSectorTileRent(
        tile.baseRent,
        devTokens,
        sectorCtrl,
        rateMultiplier,
        sectorControlMultiplier,
      ),
      ownerId,
    };
  }

  return { rent: 0, ownerId };
}

export function computeAffinityRentBonusForTile(
  state: InternalGameState,
  ownerId: string,
  position: number | string,
  rentPaid: number,
): number {
  const tile = getTileByPosition(position);
  if (!tile) return 0;
  return calculateAffinityRentBonus(state, ownerId, tile, rentPaid);
}
