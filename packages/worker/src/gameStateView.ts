import type { GameState } from "@oligopoly/validation";

/** Persisted `state_json` may include server-only affinity assignments. */
export type PersistedGameState = GameState & {
  affinityAssignments?: Record<string, string>;
  settings?: { spectatorMode?: string; [key: string]: unknown };
};

/**
 * Strip hidden affinity data for HTTP responses.
 * Callers must enforce authZ (player vs spectator) before using this.
 */
export function toClientGameState(
  state: PersistedGameState,
  mode: "spectator" | "player",
  playerId: string,
): Record<string, unknown> {
  if (mode === "spectator") {
    const { affinityAssignments: _a, ...rest } = state;
    return rest as Record<string, unknown>;
  }

  if (state.affinityAssignments) {
    const myAffinity = state.affinityAssignments[playerId] ?? null;
    const { affinityAssignments: _all, ...rest } = state;
    return { ...rest, myAffinityCardId: myAffinity } as Record<string, unknown>;
  }

  return state as Record<string, unknown>;
}
