import { AFFINITY_CARDS } from "../config/affinityCards.js";
import { DIAGONAL_TRAVERSE_BONUS } from "./setup.js";

export interface AffinityContext {
  affinityAssignments?: Record<string, string>;
}

export interface AffinityEffectContext extends AffinityContext {
  players: Array<{ playerId: string; capital: number }>;
}

export interface AffinityLogEntry {
  playerId: string | null;
  actionType: string;
  payload: Record<string, unknown> | null;
}

export const AFFINITY_IDS = {
  last_mile_logistics: AFFINITY_CARDS.last_mile_logistics.id,
  lean_manufacturing: AFFINITY_CARDS.lean_manufacturing.id,
  proptech_pioneer: AFFINITY_CARDS.proptech_pioneer.id,
} as const;

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
