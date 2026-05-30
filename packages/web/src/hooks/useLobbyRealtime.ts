import type { LobbyResponse } from "@oligopoly/validation";
import {
  LobbyRealtimeEventSchema,
  LobbyResponseSchema,
} from "@oligopoly/validation";
import { lobbyWebSocketUrl } from "../api/lobbies";
import { useRealtimeChannel } from "./useRealtimeChannel";

export type LobbyRealtimeUpdate = {
  lobby: LobbyResponse;
  source: string;
};

type UseLobbyRealtimeOptions = {
  onUpdate?: (update: LobbyRealtimeUpdate) => void;
};

export function useLobbyRealtime(
  lobbyId: string | undefined,
  options: UseLobbyRealtimeOptions = {},
) {
  return useRealtimeChannel({
    url: lobbyId ? lobbyWebSocketUrl(lobbyId) : undefined,
    schema: LobbyRealtimeEventSchema,
    onMessage: (message) => {
      if (
        (message.type === "lobby.snapshot" ||
          message.type === "lobby.updated") &&
        "payload" in message
      ) {
        const lobby = LobbyResponseSchema.safeParse(message.payload);
        if (!lobby.success) return;

        options.onUpdate?.({
          lobby: lobby.data,
          source:
            message.type === "lobby.snapshot"
              ? "Realtime lobby snapshot"
              : "Realtime lobby update",
        });
      }
    },
  });
}
