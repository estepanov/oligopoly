import type { GameState } from "@oligopoly/validation";
import { playerDisplayName } from "./gameDisplay";

type PlayerState = NonNullable<GameState["players"]>[number];

export function occupantLabels(
  state: GameState,
  occupants: PlayerState[],
  myPlayerId: string | null,
): string {
  return occupants
    .map((player) =>
      player.playerId === myPlayerId
        ? "You"
        : playerDisplayName(state, player.playerId),
    )
    .join(", ");
}

export function compactOccupantLabel(
  state: GameState,
  occupants: PlayerState[],
  myPlayerId: string | null,
): string {
  const hasMe = occupants.some((player) => player.playerId === myPlayerId);

  if (hasMe) {
    return occupants.length === 1 ? "You" : `You +${occupants.length - 1}`;
  }

  if (occupants.length === 1) {
    const occupant = occupants[0];
    return occupant
      ? playerDisplayName(state, occupant.playerId).slice(0, 2)
      : "P";
  }

  return occupants
    .slice(0, 2)
    .map((player) => playerDisplayName(state, player.playerId).slice(0, 1))
    .join("");
}
