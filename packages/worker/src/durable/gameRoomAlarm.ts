import {
  applyAuctionBidWindowExpiry,
  applyAuctionSettleExpiry,
  applyTimeoutTakeoverAndStep,
  applyTradeOfferExpiry,
} from "../services/gameAi.js";
import type { OpenRouterAiEnv } from "../services/openRouterAi.js";

type AlarmEnv = OpenRouterAiEnv & {
  DB: D1Database;
  GAME_ROOM?: DurableObjectNamespace;
  KV?: KVNamespace;
};

export interface GameRoomAlarmContext {
  gameId: string;
  env: AlarmEnv;
  /** Which timer kind won this alarm race ("turn" | "auction_bids" | …). */
  timerKind: string;
  /** Current turn actor, if a turn is in progress (cleared during auctions). */
  turnActorId?: string;
  /** Whether the TURN deadline has actually elapsed. */
  turnDeadlineReached: boolean;
}

/**
 * Single decision point for what a GameRoom alarm tick does, kept out of the
 * `alarm()` DO shell so that method stays a thin loader/persister. Behavior is
 * IDENTICAL to the prior inline implementation:
 *
 *  - Trade-offer expiry runs on EVERY tick regardless of which kind won the alarm
 *    race (it is idempotent and only acts on already-expired offers).
 *  - Auction settle/bid expiry stays gated on `timerKind`.
 *  - Turn takeover fires whenever the TURN deadline has actually elapsed,
 *    independent of which kind won (a plain `turn` alarm IS the turn deadline; a
 *    `trade_offer` alarm only takes over once the turn deadline has also elapsed;
 *    auction phases clear `turnActorId`, so it is a no-op there).
 *
 * The optimistic-conflict catch + resync/reschedule stays in `alarm()` so the DO
 * still owns its storage lifecycle.
 */
export async function handleGameRoomAlarmTick(
  ctx: GameRoomAlarmContext,
): Promise<void> {
  const { gameId, env, timerKind } = ctx;

  await applyTradeOfferExpiry(env.DB, gameId, env.GAME_ROOM);

  if (timerKind === "auction_bids") {
    await applyAuctionBidWindowExpiry(
      env.DB,
      gameId,
      env.GAME_ROOM,
      env.KV,
      env,
    );
  } else if (timerKind === "auction_settle") {
    await applyAuctionSettleExpiry(env.DB, gameId, env.GAME_ROOM, env.KV, env);
  }

  if (ctx.turnActorId && ctx.turnDeadlineReached) {
    await applyTimeoutTakeoverAndStep(
      env.DB,
      gameId,
      ctx.turnActorId,
      env.GAME_ROOM,
      env.KV,
      env,
    );
  }
}
