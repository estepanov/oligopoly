import type { LobbyResponse } from "@oligopoly/validation";
import {
  LobbyRealtimeEventSchema,
  LobbyResponseSchema,
} from "@oligopoly/validation";
import { useEffect, useRef, useState } from "react";
import { lobbyWebSocketUrl } from "../api/lobbies";

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
  const [wsStatus, setWsStatus] = useState("disconnected");
  const onUpdateRef = useRef(options.onUpdate);
  onUpdateRef.current = options.onUpdate;

  useEffect(() => {
    if (!lobbyId) {
      setWsStatus("disconnected");
      return;
    }

    setWsStatus("connecting");
    const socket = new WebSocket(lobbyWebSocketUrl(lobbyId));
    socket.onopen = () => setWsStatus("connected");
    socket.onclose = () => setWsStatus("disconnected");
    socket.onerror = () => setWsStatus("error");
    socket.onmessage = (event) => {
      try {
        const parsed = LobbyRealtimeEventSchema.safeParse(
          JSON.parse(String(event.data)),
        );
        if (!parsed.success) return;

        const message = parsed.data;
        if (
          (message.type === "lobby.snapshot" ||
            message.type === "lobby.updated") &&
          "payload" in message
        ) {
          const lobby = LobbyResponseSchema.safeParse(message.payload);
          if (!lobby.success) return;

          onUpdateRef.current?.({
            lobby: { ...lobby.data, aiSlots: lobby.data.aiSlots ?? [] },
            source:
              message.type === "lobby.snapshot"
                ? "Realtime lobby snapshot"
                : "Realtime lobby update",
          });
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    return () => socket.close();
  }, [lobbyId]);

  return { wsStatus };
}
