import {
  getActiveDeadlineCandidates,
  type InternalGameState,
  phaseHasOwnDeadline,
} from "@oligopoly/shared";
import { currentTurnActorId, turnTimeoutToMs } from "./turnTimeout.js";

export type GameTimerKind =
  | "turn"
  | "auction_bids"
  | "auction_settle"
  | "trade_offer";

type TimerCandidate = {
  deadlineAt: number;
  timerKind: GameTimerKind;
  currentPlayerId?: string | null;
};

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

  // Auction bid/settle + trade-offer deadlines come from the shared engine so
  // AI priority (`phaseHasOwnDeadline`/`findNextAiActor`) and the scheduler race
  // the same deadline set. The turn deadline is appended below since it depends
  // on durable storage + the configured turn timeout.
  const candidates: TimerCandidate[] = getActiveDeadlineCandidates(state).map(
    (candidate) => ({
      deadlineAt: candidate.deadlineAt,
      timerKind: candidate.kind,
    }),
  );

  const inAuctionPhase = phaseHasOwnDeadline(state);

  const actorId = currentTurnActorId(state);
  const timeoutMs = turnTimeoutToMs(
    (state.settings?.turnTimeout as string | undefined) ?? "5min",
  );

  if (inAuctionPhase || !actorId) {
    await storage.delete("turnActorId");
    await storage.delete("turnDeadlineAt");
  } else if (timeoutMs === null) {
    await storage.delete("turnActorId");
    await storage.delete("turnDeadlineAt");
    broadcast(
      timerEventJson(gameId, {
        deadlineAt: null,
        timerKind: "turn",
        currentPlayerId: actorId,
      }),
    );
  } else {
    const existingActorId = await storage.get<string>("turnActorId");
    const existingTurnDeadline = await storage.get<number>("turnDeadlineAt");
    const deadlineAt =
      existingActorId === actorId &&
      existingTurnDeadline !== undefined &&
      existingTurnDeadline > Date.now()
        ? existingTurnDeadline
        : Date.now() + timeoutMs;
    await storage.put("turnActorId", actorId);
    await storage.put("turnDeadlineAt", deadlineAt);
    candidates.push({
      deadlineAt,
      timerKind: "turn",
      currentPlayerId: actorId,
    });
  }

  if (candidates.length === 0) {
    await storage.deleteAlarm();
    await storage.delete("timerKind");
    return;
  }

  const winner = candidates.reduce((earliest, candidate) =>
    candidate.deadlineAt < earliest.deadlineAt ? candidate : earliest,
  );

  await storage.put("timerKind", winner.timerKind);
  await storage.put("timerDeadlineAt", winner.deadlineAt);
  await storage.setAlarm(winner.deadlineAt);
  broadcast(
    timerEventJson(gameId, {
      deadlineAt: winner.deadlineAt,
      timerKind: winner.timerKind,
      currentPlayerId: winner.currentPlayerId,
    }),
  );
}

/** @deprecated Use syncGameRoomTimer */
export const syncTurnTimer = syncGameRoomTimer;
