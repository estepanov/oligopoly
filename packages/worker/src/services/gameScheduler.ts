import type { InternalGameState } from "@oligopoly/shared";
import { currentTurnActorId, turnTimeoutToMs } from "./turnTimeout.js";

export type GameTimerKind = "turn" | "auction_bids";

export function timerEventJson(
  gameId: string,
  options: {
    deadlineAt: number | null;
    timerKind?: GameTimerKind;
    currentPlayerId?: string | null;
  },
): string {
  return JSON.stringify({
    type: "game.timer",
    sentAt: Date.now(),
    gameId,
    timerKind: options.timerKind ?? "turn",
    currentPlayerId: options.currentPlayerId ?? undefined,
    deadlineAt: options.deadlineAt,
  });
}

/** Sync GameRoom alarm + broadcast `game.timer` from canonical game state. */
export async function syncGameRoomTimer(
  storage: DurableObjectStorage,
  gameId: string,
  state: InternalGameState,
  broadcast: (message: string) => void,
): Promise<void> {
  if (state.phase === "game_over") {
    await storage.deleteAlarm();
    await storage.delete("timerKind");
    return;
  }

  if (
    state.phase === "waiting_for_auction_bids" &&
    state.pendingAuction?.bidDeadlineAt
  ) {
    const deadlineAt = state.pendingAuction.bidDeadlineAt;
    await storage.put("timerKind", "auction_bids");
    await storage.put("timerDeadlineAt", deadlineAt);
    await storage.delete("turnActorId");
    await storage.delete("turnDeadlineAt");
    await storage.setAlarm(deadlineAt);
    broadcast(
      timerEventJson(gameId, {
        deadlineAt,
        timerKind: "auction_bids",
      }),
    );
    return;
  }

  const actorId = currentTurnActorId(state);
  if (!actorId) {
    await storage.deleteAlarm();
    return;
  }

  const timeoutMs = turnTimeoutToMs(
    (state.settings?.turnTimeout as string | undefined) ?? "5min",
  );

  await storage.put("timerKind", "turn");

  if (timeoutMs === null) {
    await storage.deleteAlarm();
    await storage.delete("turnActorId");
    await storage.delete("turnDeadlineAt");
    broadcast(
      timerEventJson(gameId, {
        deadlineAt: null,
        timerKind: "turn",
        currentPlayerId: actorId,
      }),
    );
    return;
  }

  const deadlineAt = Date.now() + timeoutMs;
  await storage.put("turnActorId", actorId);
  await storage.put("turnDeadlineAt", deadlineAt);
  await storage.put("timerDeadlineAt", deadlineAt);
  await storage.setAlarm(deadlineAt);
  broadcast(
    timerEventJson(gameId, {
      deadlineAt,
      timerKind: "turn",
      currentPlayerId: actorId,
    }),
  );
}

/** @deprecated Use syncGameRoomTimer */
export const syncTurnTimer = syncGameRoomTimer;
