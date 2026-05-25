import type { GameState, PendingAuction } from "@oligopoly/validation";

/** Persisted `state_json` may include server-only affinity assignments. */
export type PersistedGameState = GameState & {
  affinityAssignments?: Record<string, string>;
  settings?: { spectatorMode?: string; [key: string]: unknown };
};

type ClientPendingAuction = PendingAuction & {
  submissionCount: number;
  mySubmission?: number | "pass";
};

function redactPendingAuction(
  auction: PendingAuction,
  viewerId: string,
  mode: "spectator" | "player",
): ClientPendingAuction {
  const submissionCount = Object.keys(auction.submissions).length;
  if (mode === "spectator") {
    const { submissions: _submissions, ...rest } = auction;
    return { ...rest, submissions: {}, submissionCount };
  }

  const mySubmission = auction.submissions[viewerId];
  return {
    ...auction,
    submissions: {},
    submissionCount,
    ...(mySubmission !== undefined ? { mySubmission } : {}),
  };
}

/**
 * Strip hidden affinity data for HTTP responses.
 * Callers must enforce authZ (player vs spectator) before using this.
 */
export function toClientGameState(
  state: PersistedGameState,
  mode: "spectator" | "player",
  playerId: string,
): Record<string, unknown> {
  const pendingAuction = state.pendingAuction
    ? redactPendingAuction(state.pendingAuction, playerId, mode)
    : undefined;

  if (mode === "spectator") {
    const { affinityAssignments: _a, pendingAuction: _p, ...rest } = state;
    return { ...rest, ...(pendingAuction ? { pendingAuction } : {}) };
  }

  if (state.affinityAssignments) {
    const myAffinity = state.affinityAssignments[playerId] ?? null;
    const { affinityAssignments: _all, pendingAuction: _p, ...rest } = state;
    return {
      ...rest,
      ...(pendingAuction ? { pendingAuction } : {}),
      myAffinityCardId: myAffinity,
    } as Record<string, unknown>;
  }

  const { pendingAuction: _p, ...rest } = state;
  return {
    ...rest,
    ...(pendingAuction ? { pendingAuction } : {}),
  } as Record<string, unknown>;
}
