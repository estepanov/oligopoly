export interface AffinityContext {
  affinityAssignments?: Record<string, string>;
}

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
