import type { GameLogEntry, GameState } from "@oligopoly/validation";
import {
  GameRealtimeEventSchema,
  GameStateSchema,
} from "@oligopoly/validation";
import { useState } from "react";
import { gameWebSocketUrl } from "../api/games";
import type { AiPresentationBeatInput } from "../lib/aiPresentationQueue";
import { useRealtimeChannel } from "./useRealtimeChannel";

export type GameSessionUpdate = {
  state: GameState;
  logEntries?: GameLogEntry[];
  source: string;
};

type UseGameRealtimeOptions = {
  onUpdate?: (update: GameSessionUpdate) => void;
  /** A single AI-seat presentation beat, mapped from a `game.ai_action` WS
   * event straight into the one beat-input shape shared end-to-end by
   * `useGameSession` and the presentation queue. The event's `action` field
   * is redacted server-side (see `redactAiActionForBroadcast` in
   * `@oligopoly/worker`) and unused on the client, so it is dropped here
   * rather than threaded through as dead wire parity. */
  onAiAction?: (update: AiPresentationBeatInput) => void;
};

export function useGameRealtime(
  gameId: string | undefined,
  options: UseGameRealtimeOptions = {},
) {
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [timerKind, setTimerKind] = useState<
    "turn" | "auction_bids" | "auction_settle" | "trade_offer"
  >("turn");

  const { wsStatus } = useRealtimeChannel({
    url: gameId ? gameWebSocketUrl(gameId) : undefined,
    schema: GameRealtimeEventSchema,
    onDisconnect: () => setTurnDeadline(null),
    onMessage: (message) => {
      if (message.type === "game.action_applied" && "state" in message) {
        options.onUpdate?.({
          state: GameStateSchema.parse(message.state),
          logEntries: message.logEntries,
          source: "Realtime state update",
        });
        return;
      }
      if (message.type === "game.schedule" && "state" in message) {
        options.onUpdate?.({
          state: GameStateSchema.parse(message.state),
          source: "Realtime schedule update",
        });
        return;
      }
      if (message.type === "game.snapshot" && "payload" in message) {
        options.onUpdate?.({
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
        return;
      }
      if (message.type === "game.ai_action") {
        options.onAiAction?.({
          aiPlayerId: message.aiPlayerId,
          displayName: message.displayName,
          material: message.material,
          softTurnEnd: message.softTurnEnd,
          summary: message.summary,
          stateVersion: message.stateVersion,
          sentAt: message.sentAt,
        });
      }
    },
  });

  return { wsStatus, turnDeadline, timerKind };
}
