import type { TurnTimeout } from "@oligopoly/validation";

const MINUTE_MS = 60_000;

/** Returns null when the lobby disables turn timeouts. */
export function turnTimeoutToMs(timeout: TurnTimeout | string | undefined): number | null {
  switch (timeout) {
    case "1min":
      return MINUTE_MS;
    case "5min":
      return 5 * MINUTE_MS;
    case "30min":
      return 30 * MINUTE_MS;
    case "2h":
      return 2 * 60 * MINUTE_MS;
    case "8h":
      return 8 * 60 * MINUTE_MS;
    case "24h":
      return 24 * 60 * MINUTE_MS;
    case "48h":
      return 48 * 60 * MINUTE_MS;
    case "7d":
      return 7 * 24 * 60 * MINUTE_MS;
    case "none":
      return null;
    default:
      return 5 * MINUTE_MS;
  }
}

export function currentTurnActorId(state: {
  turnOrder?: string[];
  currentPlayerIndex?: number;
}): string | null {
  const order = state.turnOrder;
  const index = state.currentPlayerIndex;
  if (!order?.length || index === undefined || index < 0 || index >= order.length) {
    return null;
  }
  return order[index] ?? null;
}
