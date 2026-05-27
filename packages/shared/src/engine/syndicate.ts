import {
  ALL_TILES,
  getTileByPosition,
  HUB_ADJACENT_SECTORS,
  SECTOR_HUB_POSITIONS,
} from "../config/board.js";
import { checkSyndicateWin } from "./winCondition.js";

export interface SyndicateCharterState {
  governanceModel: "asset_weighted" | "equal_vote";
  deadlockResolution: "public_dice_roll";
  revenueSplit: Array<{ playerId: string; pct: number }>;
  contributionWeights: {
    assetScorePct: number;
    revenueScorePct: number;
    negotiationCreditPct: number;
  };
  dissolutionClause: {
    trustPenaltyPerMember: number;
    requiresUnanimousVote: true;
  };
  ratifiedAt: number;
}

/** Default charter used when forming a syndicate from the client. */
export function buildDefaultSyndicateCharter(
  memberIds: string[],
): SyndicateCharterState {
  const pct = Math.floor(100 / memberIds.length);
  const remainder = 100 - pct * memberIds.length;
  return {
    governanceModel: "equal_vote",
    deadlockResolution: "public_dice_roll",
    revenueSplit: memberIds.map((id, index) => ({
      playerId: id,
      pct: pct + (index === 0 ? remainder : 0),
    })),
    contributionWeights: {
      assetScorePct: 35,
      revenueScorePct: 35,
      negotiationCreditPct: 30,
    },
    dissolutionClause: {
      trustPenaltyPerMember: -2,
      requiresUnanimousVote: true,
    },
    ratifiedAt: Date.now(),
  };
}

export interface SyndicateState {
  syndicateId: string;
  adminId: string;
  memberIds: string[];
  charter?: SyndicateCharterState;
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

export function hasSectorControl(
  state: SyndicateGameContext,
  playerId: string,
  sectorId: string,
): boolean {
  const controllers = controllingPlayerIds(state, playerId);
  const sectorTiles = ALL_TILES.filter(
    (tile) => tile.sectorId === sectorId && tile.type === "sector_tile",
  );
  return sectorTiles.every((tile) => {
    const tileState = state.tiles.find(
      (entry) => String(entry.position) === String(tile.position),
    );
    return (
      tileState?.ownerId &&
      controllers.includes(tileState.ownerId) &&
      !tileState.mortgaged
    );
  });
}

export function ownsHubForSector(
  state: SyndicateGameContext,
  playerId: string,
  sectorId: string,
): boolean {
  for (const [hubKey, adjacentSector] of Object.entries(HUB_ADJACENT_SECTORS)) {
    if (adjacentSector !== sectorId) continue;
    const hubPos =
      SECTOR_HUB_POSITIONS[hubKey as keyof typeof SECTOR_HUB_POSITIONS];
    const tileState = state.tiles.find((tile) => tile.position === hubPos);
    if (
      tileState?.ownerId &&
      tileOwnedByController(state, playerId, tileState.ownerId) &&
      !tileState.mortgaged
    ) {
      return true;
    }
  }
  return false;
}

export function visitorControlsSector(
  state: SyndicateGameContext,
  visitorId: string,
  sectorId: string,
): boolean {
  return hasSectorControl(state, visitorId, sectorId);
}

export function sumOwnedTileMarketValue(
  state: SyndicateGameContext,
  ownerIds: readonly string[],
): number {
  const owners = new Set(ownerIds);
  return state.tiles
    .filter((tile) => tile.ownerId && owners.has(tile.ownerId))
    .reduce((sum, tile) => {
      const config = getTileByPosition(tile.position);
      return sum + (config?.cost ?? 0);
    }, 0);
}

export function syndicateMarketValue(
  state: SyndicateGameContext,
  memberIds: readonly string[],
): number {
  return sumOwnedTileMarketValue(state, memberIds);
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

export function formSyndicateApCost(
  state: { affinityAssignments?: Record<string, string> },
  playerId: string,
): number {
  return state.affinityAssignments?.[playerId] === "founding_partner" ? 0 : 1;
}
