// ---------------------------------------------------------------------------
// Single source of truth for "which phases drive their own deadline" and the
// active deadline candidates derived from canonical game state. Both the AI
// orchestrator (`ai.ts` — auction/own-deadline phases beat the trade inbox) and
// the worker scheduler (`gameScheduler.syncGameRoomTimer` — earliest deadline
// wins the alarm) consume these so the two can't drift when a new
// deadline-driven phase appears.
// ---------------------------------------------------------------------------

import type { InternalGameState } from "./gameStateTypes.js";
import { nextTradeOfferExpiry } from "./tradeActions.js";

/**
 * The kind of deadline a candidate represents. Mirrors the worker's
 * `GameTimerKind` minus `"turn"` — the turn deadline is owned by the worker
 * (it depends on durable storage + the configured turn timeout), so the shared
 * layer only knows the state-derived deadlines.
 */
export type DeadlineKind = "auction_bids" | "auction_settle" | "trade_offer";

export interface DeadlineCandidate {
  deadlineAt: number;
  kind: DeadlineKind;
}

/**
 * Phases that drive their own deadline (the live auction bid/settle windows).
 * When the game is in one of these, the phase actor takes priority over an
 * off-turn trade-inbox response so a pending trade can't stall the live auction
 * window — the AI priority model in `findNextAiActor`. Kept here (not in
 * `ai.ts`) so the scheduler's deadline racing and the AI's priority share one
 * definition of "own-deadline phase".
 */
export function phaseHasOwnDeadline(state: InternalGameState): boolean {
  return (
    state.phase === "waiting_for_auction_bids" ||
    state.phase === "waiting_for_auction_settle"
  );
}

/**
 * The active state-derived deadlines (auction bid/settle window expiry and the
 * next pending trade-offer expiry). The worker scheduler appends the turn
 * deadline and then picks the earliest. Reuses `nextTradeOfferExpiry` and the
 * auction deadline fields rather than re-deriving them.
 */
export function getActiveDeadlineCandidates(
  state: InternalGameState,
): DeadlineCandidate[] {
  const candidates: DeadlineCandidate[] = [];

  const tradeDeadlineAt = nextTradeOfferExpiry(state);
  if (tradeDeadlineAt !== null) {
    candidates.push({ deadlineAt: tradeDeadlineAt, kind: "trade_offer" });
  }

  if (
    state.phase === "waiting_for_auction_settle" &&
    state.pendingAuction?.settleDeadlineAt
  ) {
    candidates.push({
      deadlineAt: state.pendingAuction.settleDeadlineAt,
      kind: "auction_settle",
    });
  }

  if (
    state.phase === "waiting_for_auction_bids" &&
    state.pendingAuction?.bidDeadlineAt
  ) {
    candidates.push({
      deadlineAt: state.pendingAuction.bidDeadlineAt,
      kind: "auction_bids",
    });
  }

  return candidates;
}
