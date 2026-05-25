import type { InternalGameState } from "@oligopoly/shared";
import { currentTurnActorId, turnTimeoutToMs } from "./turnTimeout.js";

export function timerEventJson(
  gameId: string,
  currentPlayerId: string,
  deadlineAt: number | null,
): string {
  return JSON.stringify({
    type: "game.timer",
    sentAt: Date.now(),
    gameId,
    currentPlayerId,
    deadlineAt,
  });
}

/** Sync turn-timeout alarm + broadcast `game.timer` from canonical game state. */
export async function syncTurnTimer(
  storage: DurableObjectStorage,
  gameId: string,
  state: InternalGameState,
  broadcast: (message: string) => void,
): Promise<void> {
  if (state.phase === "game_over") {
    await storage.deleteAlarm();
    return;
  }

  const actorId = currentTurnActorId(state);
  if (!actorId) return;

  const timeoutMs = turnTimeoutToMs(
    (state.settings?.turnTimeout as string | undefined) ?? "5min",
  );

  if (timeoutMs === null) {
    await storage.deleteAlarm();
    broadcast(timerEventJson(gameId, actorId, null));
    return;
  }

  const deadlineAt = Date.now() + timeoutMs;
  await storage.put("turnActorId", actorId);
  await storage.put("turnDeadlineAt", deadlineAt);
  await storage.setAlarm(deadlineAt);
  broadcast(timerEventJson(gameId, actorId, deadlineAt));
}
