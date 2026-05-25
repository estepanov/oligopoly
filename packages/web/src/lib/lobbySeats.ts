import type { LobbyResponse } from "@oligopoly/validation";

export function lobbySeatCount(lobby: {
  players: LobbyResponse["players"];
  aiSlots?: LobbyResponse["aiSlots"];
}): number {
  return lobby.players.length + (lobby.aiSlots?.length ?? 0);
}

export function canStartLobby(
  status: LobbyResponse["status"],
  seatCount: number,
) {
  return status === "waiting" && seatCount >= 2;
}
