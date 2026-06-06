import type { GameState } from "@oligopoly/validation";

export type CurrencyDisplaySettings = {
  currencySymbol?: unknown;
  currencyMultiplier?: unknown;
};

export function formatCurrencyAmount(
  amount: number,
  settings?: CurrencyDisplaySettings,
): string {
  const symbol =
    typeof settings?.currencySymbol === "string"
      ? settings.currencySymbol
      : "$";
  const multiplier =
    typeof settings?.currencyMultiplier === "string"
      ? Number.parseInt(settings.currencyMultiplier, 10)
      : typeof settings?.currencyMultiplier === "number"
        ? settings.currencyMultiplier
        : 1;
  const displayAmount = amount * (Number.isFinite(multiplier) ? multiplier : 1);
  return `${symbol}${displayAmount.toLocaleString()}`;
}

export function formatSignedCurrencyAmount(
  amount: number,
  settings?: CurrencyDisplaySettings,
): string {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${formatCurrencyAmount(Math.abs(amount), settings)}`;
}

export function playerDisplayName(
  state: Pick<GameState, "players" | "aiPlayers">,
  playerId: string | null | undefined,
  options?: { myPlayerId?: string | null; youLabel?: string },
): string {
  if (!playerId) return "Unknown";
  if (options?.myPlayerId && playerId === options.myPlayerId) {
    return options.youLabel ?? "You";
  }

  const player = state.players?.find((entry) => entry.playerId === playerId);
  if (player?.displayName) return player.displayName;

  const aiRuntime = state.aiPlayers?.find(
    (entry) =>
      entry.playerId === playerId || entry.takeoverForPlayerId === playerId,
  );
  if (aiRuntime?.name) return aiRuntime.name;

  return playerId;
}

export function playerNameMap(
  state: Pick<GameState, "players" | "aiPlayers">,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const player of state.players ?? []) {
    map.set(player.playerId, playerDisplayName(state, player.playerId));
  }
  for (const ai of state.aiPlayers ?? []) {
    map.set(ai.playerId, ai.name);
    if (ai.takeoverForPlayerId) {
      map.set(ai.takeoverForPlayerId, ai.name);
    }
  }
  return map;
}
