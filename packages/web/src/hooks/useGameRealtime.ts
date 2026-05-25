import type { GameLogEntry, GameState } from "@oligopoly/validation";
import {
  GameRealtimeEventSchema,
  GameStateSchema,
} from "@oligopoly/validation";
import { useEffect, useRef, useState } from "react";
import { gameWebSocketUrl } from "../api/games";

export type GameSessionUpdate = {
  state: GameState;
  logEntries?: GameLogEntry[];
  source: string;
};

type UseGameRealtimeOptions = {
  onUpdate?: (update: GameSessionUpdate) => void;
};

export function useGameRealtime(
  gameId: string | undefined,
  options: UseGameRealtimeOptions = {},
) {
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [timerKind, setTimerKind] = useState<
    "turn" | "auction_bids" | "auction_settle"
  >("turn");
  const onUpdateRef = useRef(options.onUpdate);
  onUpdateRef.current = options.onUpdate;

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
        if (!parsed.success) return;

        const message = parsed.data;
        if (message.type === "game.action_applied" && "state" in message) {
          onUpdateRef.current?.({
            state: GameStateSchema.parse(message.state),
            logEntries: message.logEntries,
            source: "Realtime state update",
          });
          return;
        }
        if (message.type === "game.schedule" && "state" in message) {
          onUpdateRef.current?.({
            state: GameStateSchema.parse(message.state),
            source: "Realtime schedule update",
          });
          return;
        }
        if (message.type === "game.snapshot" && "payload" in message) {
          onUpdateRef.current?.({
            state: GameStateSchema.parse(message.payload),
            source: "Realtime snapshot",
          });
          return;
        }
        if (message.type === "game.timer" && "deadlineAt" in message) {
          setTurnDeadline(message.deadlineAt ?? null);
          if (message.timerKind) {
            setTimerKind(message.timerKind);
          }
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    return () => socket.close();
  }, [gameId]);

  return { wsStatus, turnDeadline, timerKind };
}
