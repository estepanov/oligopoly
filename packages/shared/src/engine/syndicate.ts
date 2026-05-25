import { getTileByPosition } from "../config/board.js";
import { checkSyndicateWin } from "./winCondition.js";

export interface SyndicateState {
  syndicateId: string;
  adminId: string;
  memberIds: string[];
}

export interface SyndicateGameContext {
  syndicates?: Record<string, SyndicateState>;
  players: Array<{ playerId: string; syndicateId?: string | null }>;
  tiles: Array<{
    position: number | string;
    ownerId: string | null;
    mortgaged?: boolean;
  }>;
}

export function getSyndicateForPlayer(
  state: SyndicateGameContext,
  playerId: string,
): SyndicateState | null {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player?.syndicateId) return null;
  return state.syndicates?.[player.syndicateId] ?? null;
}

export function controllingPlayerIds(
  state: SyndicateGameContext,
  playerId: string,
): string[] {
  const syndicate = getSyndicateForPlayer(state, playerId);
  return syndicate ? [...syndicate.memberIds] : [playerId];
}

export function areSameSyndicate(
  state: SyndicateGameContext,
  playerA: string,
  playerB: string,
): boolean {
  const syndicate = getSyndicateForPlayer(state, playerA);
  return syndicate
    ? syndicate.memberIds.includes(playerB)
    : playerA === playerB;
}

export function tileOwnedByController(
  state: SyndicateGameContext,
  controllerId: string,
  ownerId: string | null | undefined,
): boolean {
  if (!ownerId) return false;
  if (ownerId === controllerId) return true;
  return areSameSyndicate(state, controllerId, ownerId);
}

export function syndicateMarketValue(
  state: SyndicateGameContext,
  memberIds: readonly string[],
): number {
  const members = new Set(memberIds);
  return state.tiles
    .filter((tile) => tile.ownerId && members.has(tile.ownerId))
    .reduce((sum, tile) => {
      const config = getTileByPosition(tile.position);
      return sum + (config?.cost ?? 0);
    }, 0);
}

export function findSyndicateWinnerId(
  state: SyndicateGameContext,
  totalMarketValue: number,
): string | null {
  for (const syndicate of Object.values(state.syndicates ?? {})) {
    const marketValue = syndicateMarketValue(state, syndicate.memberIds);
    if (checkSyndicateWin(marketValue, totalMarketValue)) {
      return syndicate.adminId;
    }
  }
  return null;
}
