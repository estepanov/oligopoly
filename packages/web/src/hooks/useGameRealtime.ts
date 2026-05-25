import type { GameState } from "@oligopoly/validation";
import {
  GameRealtimeEventSchema,
  GameStateSchema,
} from "@oligopoly/validation";
import { useEffect, useRef, useState } from "react";
import { gameWebSocketUrl } from "../api/games";

type UseGameRealtimeOptions = {
  onState?: (state: GameState, source: string) => void;
};

export function useGameRealtime(
  gameId: string | undefined,
  options: UseGameRealtimeOptions = {},
) {
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const onStateRef = useRef(options.onState);
  onStateRef.current = options.onState;

  useEffect(() => {
    if (!gameId) {
      setWsStatus("disconnected");
      setTurnDeadline(null);
      return;
    }

    setWsStatus("connecting");
    const socket = new WebSocket(gameWebSocketUrl(gameId));
    socket.onopen = () => setWsStatus("connected");
    socket.onclose = () => setWsStatus("disconnected");
    socket.onerror = () => setWsStatus("error");
    socket.onmessage = (event) => {
      try {
        const parsed = GameRealtimeEventSchema.safeParse(
          JSON.parse(String(event.data)),
        );
        if (parsed.success) {
          const message = parsed.data;
          if (message.type === "game.action_applied" && "state" in message) {
            const nextState = GameStateSchema.parse(message.state);
            onStateRef.current?.(nextState, "Realtime state update");
            return;
          }
          if (message.type === "game.snapshot" && "payload" in message) {
            const nextState = GameStateSchema.parse(message.payload);
            onStateRef.current?.(nextState, "Realtime snapshot");
            return;
          }
          if (message.type === "game.timer" && "deadlineAt" in message) {
            setTurnDeadline(message.deadlineAt ?? null);
            return;
          }
        }
      } catch {
        // Fall through to raw event logging.
      }
      setLastEvent(`Realtime event: ${event.data}`);
    };

    return () => socket.close();
  }, [gameId]);

  return { wsStatus, turnDeadline, lastEvent, setLastEvent };
}
