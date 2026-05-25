import { AFFINITY_CARDS } from "../config/affinityCards.js";
import type { BoardTile } from "../config/board.js";
import { DIAGONAL_TRAVERSE_BONUS } from "./setup.js";

export interface AffinityContext {
  affinityAssignments?: Record<string, string>;
}

export interface AffinityEffectContext extends AffinityContext {
  players: Array<{
    playerId: string;
    capital: number;
    usedAffinityIds?: string[];
  }>;
}

export interface AffinityLogEntry {
  playerId: string | null;
  actionType: string;
  payload: Record<string, unknown> | null;
}

export const AFFINITY_IDS = {
  ai_pioneer: AFFINITY_CARDS.ai_pioneer.id,
  quantitative_analyst: AFFINITY_CARDS.quantitative_analyst.id,
  esg_fund_manager: AFFINITY_CARDS.esg_fund_manager.id,
  biotech_ip: AFFINITY_CARDS.biotech_ip.id,
  streaming_pioneer: AFFINITY_CARDS.streaming_pioneer.id,
  last_mile_logistics: AFFINITY_CARDS.last_mile_logistics.id,
  consumer_insights: AFFINITY_CARDS.consumer_insights.id,
  lean_manufacturing: AFFINITY_CARDS.lean_manufacturing.id,
  spectrum_holder: AFFINITY_CARDS.spectrum_holder.id,
  proptech_pioneer: AFFINITY_CARDS.proptech_pioneer.id,
  crypto_arbitrageur: AFFINITY_CARDS.crypto_arbitrageur.id,
  founding_partner: AFFINITY_CARDS.founding_partner.id,
} as const;

const NULLIFIABLE_DISRUPTION_CARDS = new Set([
  "disruption_patent_troll",
  "disruption_leveraged_buyout",
  "disruption_whistleblower_payoff",
  "disruption_corporate_espionage",
  "disruption_go_to_regulation",
]);

export function getPlayerAffinityId(
  state: AffinityContext,
  playerId: string,
): string | null {
  return state.affinityAssignments?.[playerId] ?? null;
}

export function hasPlayerAffinity(
  state: AffinityContext,
  playerId: string,
  affinityId: string,
): boolean {
  return getPlayerAffinityId(state, playerId) === affinityId;
}

export function hasUsedAffinity(
  state: AffinityEffectContext,
  playerId: string,
  affinityId: string,
): boolean {
  const player = state.players.find((entry) => entry.playerId === playerId);
  return player?.usedAffinityIds?.includes(affinityId) ?? false;
}

export function markAffinityUsed(
  state: AffinityEffectContext,
  playerId: string,
  affinityId: string,
): void {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) return;
  if (!player.usedAffinityIds) {
    player.usedAffinityIds = [];
  }
  if (!player.usedAffinityIds.includes(affinityId)) {
    player.usedAffinityIds.push(affinityId);
  }
}

export function canNullifyDisruptionWithBiotech(
  state: AffinityEffectContext,
  playerId: string,
  cardId: string,
): boolean {
  return (
    NULLIFIABLE_DISRUPTION_CARDS.has(cardId) &&
    hasPlayerAffinity(state, playerId, AFFINITY_IDS.biotech_ip) &&
    !hasUsedAffinity(state, playerId, AFFINITY_IDS.biotech_ip)
  );
}

export function applyAcquisitionCostAffinity(
  state: AffinityContext,
  playerId: string,
  sectorId: string | null | undefined,
  cost: number,
): number {
  if (
    (sectorId === "big_tech" || sectorId === "emerging_tech") &&
    hasPlayerAffinity(state, playerId, AFFINITY_IDS.ai_pioneer)
  ) {
    return Math.floor(cost * 0.85);
  }
  return cost;
}

export function calculateAffinityRentBonus(
  state: AffinityContext,
  ownerId: string,
  tile: BoardTile,
  rentPaid: number,
): number {
  if (rentPaid <= 0) return 0;

  if (
    tile.sectorId === "finance" &&
    hasPlayerAffinity(state, ownerId, AFFINITY_IDS.quantitative_analyst)
  ) {
    return Math.floor(rentPaid * 0.1);
  }

  if (
    tile.sectorId === "energy" &&
    hasPlayerAffinity(state, ownerId, AFFINITY_IDS.esg_fund_manager)
  ) {
    return Math.floor(rentPaid * 0.15);
  }

  if (
    tile.sectorId === "defense_media" &&
    hasPlayerAffinity(state, ownerId, AFFINITY_IDS.streaming_pioneer)
  ) {
    return Math.floor(rentPaid * 0.15);
  }

  return 0;
}

export function spectrumHolderUtilityMultiplier(
  state: AffinityContext,
  ownerId: string,
  utilitiesControlled: number,
): number | undefined {
  if (
    utilitiesControlled >= 2 &&
    hasPlayerAffinity(state, ownerId, AFFINITY_IDS.spectrum_holder)
  ) {
    return 1.5;
  }
  return undefined;
}

export function formSyndicateApCost(
  state: AffinityContext,
  playerId: string,
): number {
  return hasPlayerAffinity(state, playerId, AFFINITY_IDS.founding_partner)
    ? 0
    : 1;
}

export function applyLastMileLogisticsTraverseBonus(
  state: AffinityEffectContext,
  playerId: string,
  logs: AffinityLogEntry[],
): void {
  if (!hasPlayerAffinity(state, playerId, AFFINITY_IDS.last_mile_logistics)) {
    return;
  }

  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) return;

  player.capital += DIAGONAL_TRAVERSE_BONUS;
  logs.push({
    playerId,
    actionType: "affinity_bonus",
    payload: {
      affinityId: AFFINITY_IDS.last_mile_logistics,
      amount: DIAGONAL_TRAVERSE_BONUS,
      reason: "diagonal_traverse",
    },
  });
}
