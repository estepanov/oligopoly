import type { LobbyResponse } from "@oligopoly/validation";

export type LobbyPlayer = LobbyResponse["players"][number];

export function sortedLobbyPlayers(
  players: LobbyResponse["players"],
): LobbyResponse["players"] {
  return [...players].sort((left, right) => {
    if (left.isAdmin !== right.isAdmin) return left.isAdmin ? -1 : 1;
    return left.joinedAt - right.joinedAt;
  });
}

export function lobbyPlayerLabel(
  player: LobbyPlayer,
  index: number,
  viewerId: string | undefined,
): string {
  if (player.userId === viewerId) return "You";
  return `Player ${index + 1}`;
}

export function lobbyPlayerRole(player: LobbyPlayer): string {
  return player.isAdmin ? "Host" : "Player";
}
