import type { InternalGameState } from "@oligopoly/shared";
import { normalizeGameState } from "@oligopoly/shared";
import type { GameLogEntry, TradeOffer } from "@oligopoly/validation";
import { toClientGameStateFromInternal } from "../gameStateView.js";
import { redactLogEntriesForViewer } from "./gameVisibilityFilters.js";

/**
 * SINGLE owner of the trade-offer broadcast privacy contract.
 *
 * Contract (strip → carry → re-inject → scope), enforced here and nowhere else:
 *
 *  1. STRIP: the state that travels on `broadcastGameEvent` (`event.state`) NEVER
 *     carries `tradeOffers`. `splitBroadcastPayload` peels the private offer terms
 *     off `state`.
 *  2. CARRY: the offers ride on a SEPARATE `tradeOffers` field of the wire event.
 *  3. RE-INJECT: `prepareScopableGameEvent` (run ONCE per broadcast, before the
 *     per-viewer fan-out) folds the carried offers back onto the state and
 *     normalizes it a single time.
 *  4. SCOPE: `scopeGameEventForViewer` (run per viewer) redacts everything —
 *     trade offers, auctions, handshakes, negotiation threads, affinity, and log
 *     entries — down to that viewer's own slice via `toClientGameStateFromInternal`.
 *
 * Type-enforcement (so the contract can't drift via discipline): the emit-event
 * builders accept only a `ScopableBroadcastPayload`, which is constructable
 * solely via `splitBroadcastPayload`. Because that wrapper is the only sanctioned
 * way to produce a payload — and it strips `tradeOffers` off `state` into the
 * separate carried field — forgetting to strip is a TYPE ERROR, not a comment
 * contract. HTTP responses do not use this path: they call `toClientGameState`
 * directly for the requesting player (party-scoped filter), or strip offers
 * entirely via `publicStateForBroadcast`.
 */

/** A game state with its private `tradeOffers` removed, so it is safe to put on
 * the wire. The privacy guarantee comes from the `ScopableBroadcastPayload`
 * wrapper (only `splitBroadcastPayload` can build one), not from this type alone. */
export type StrippedBroadcastState<TState> = Omit<TState, "tradeOffers">;

/**
 * The result of splitting a broadcast state into its wire-safe `publicState`
 * (offers stripped) and the side-channel `tradeOffers` that `GameRoom.broadcast`
 * re-injects per viewer. Only this prepared payload may be handed to the emit
 * builders / per-viewer scoper.
 */
export interface ScopableBroadcastPayload<TState> {
  publicState: StrippedBroadcastState<TState>;
  tradeOffers?: TradeOffer[];
}

/**
 * Strip private `tradeOffers` off the broadcast state and return them on a
 * separate field. This is the ONLY sanctioned way to produce a wire-safe state +
 * carried offers; every realtime emit path (`notifyGameActionResult`,
 * `notifyGameSchedule`, the DO alarm/AI-loop emit) goes through it so the
 * redaction can never drift.
 */
export function splitBroadcastPayload<TState extends { tradeOffers?: unknown }>(
  state: TState,
): ScopableBroadcastPayload<TState> {
  const { tradeOffers, ...stateWithoutTradeOffers } = state;
  return {
    publicState: stateWithoutTradeOffers as StrippedBroadcastState<TState>,
    ...(Array.isArray(tradeOffers)
      ? { tradeOffers: tradeOffers as TradeOffer[] }
      : {}),
  };
}

/**
 * Build the over-the-wire fields (`state` + optional `tradeOffers`) for an emit
 * event from a prepared payload. Spreading this into an event object keeps the
 * strip-and-carry shape identical across every emit builder.
 */
export function broadcastEventStateFields<TState>(
  payload: ScopableBroadcastPayload<TState>,
): { state: StrippedBroadcastState<TState>; tradeOffers?: TradeOffer[] } {
  return {
    state: payload.publicState,
    ...(payload.tradeOffers ? { tradeOffers: payload.tradeOffers } : {}),
  };
}

/**
 * Build the `game.schedule` broadcast event with the trade-offer strip-and-carry
 * applied ONCE. Both emit paths — `notifyGameSchedule` (the worker→DO POST) and
 * the in-DO AI-loop fan-out in `rooms.ts` — go through this so the pattern has a
 * single implementation.
 */
export function buildGameScheduleEvent<
  TState extends { tradeOffers?: unknown },
>(gameId: string, state: TState): Record<string, unknown> {
  return {
    type: "game.schedule",
    sentAt: Date.now(),
    gameId,
    ...broadcastEventStateFields(splitBroadcastPayload(state)),
  };
}

/** Identifies the WebSocket session a broadcast event is being scoped for. */
export interface BroadcastViewer {
  viewerId: string;
  spectator: boolean;
}

/**
 * A realtime game event as it travels on the wire BEFORE per-viewer scoping. The
 * broadcast source strips private `tradeOffers` terms off `state` and carries
 * them on the separate `tradeOffers` field (see `splitBroadcastPayload`);
 * `scopeGameEventForViewer` re-injects them per viewer and redacts everything
 * down to the viewer's own slice. Extra event fields (type, sentAt, gameId, …)
 * are preserved untouched.
 */
export interface ScopableGameEvent {
  state: Record<string, unknown>;
  /**
   * The side-channel array of EVERY party's offers (re-injected into `state` by
   * `prepareScopableGameEvent` before normalization). `prepareScopableGameEvent`
   * still guards with `Array.isArray`.
   */
  tradeOffers?: TradeOffer[];
  logEntries?: Array<Pick<GameLogEntry, "actionType" | "payload">>;
  // Broadcast events carry extra transport fields (type, gameId, sentAt, …) that
  // pass through untouched, so an open index signature is intentional here.
  [key: string]: unknown;
}

/**
 * A broadcast event whose `state` has already been normalized exactly ONCE (with
 * the carried trade offers re-injected). Produced by `prepareScopableGameEvent`
 * and consumed per-viewer by `scopeGameEventForViewer`, so the per-viewer step is
 * a pure redaction that never mutates shared state.
 */
export interface PreparedGameEvent {
  /** Normalized engine state shared (read-only) across all viewer redactions. */
  normalizedState: InternalGameState;
  /** Original event fields minus `state`/`tradeOffers` (already consumed). */
  rest: Record<string, unknown>;
  logEntries?: Array<Pick<GameLogEntry, "actionType" | "payload">>;
}

/**
 * Per-broadcast preparation (run ONCE, before the per-viewer fan-out). Re-injects
 * the separately-carried `tradeOffers` into `state` and normalizes it a single
 * time. `normalizeGameState` mutates its argument, so doing this once here — and
 * sharing the resulting object read-only with every per-viewer redaction —
 * guarantees no shared nested mutation can leak across viewers (each viewer's
 * `scopeGameEventForViewer` only reads from it).
 *
 * The side-channel `tradeOffers` (which holds EVERY party's terms) is dropped
 * from the carried `rest` here — each viewer's own offers are re-derived, redacted,
 * inside their `scopedState.tradeOffers`. Keeping the raw array would leak foreign
 * terms to every recipient.
 */
export function prepareScopableGameEvent(
  event: ScopableGameEvent,
): PreparedGameEvent {
  // Re-inject the separately-carried trade offers so the per-viewer filter can
  // keep each viewer's own slice. Falls back to any `tradeOffers` already on
  // `state` for legacy/other callers.
  const carriedTradeOffers = Array.isArray(event.tradeOffers)
    ? event.tradeOffers
    : null;
  const rawState = carriedTradeOffers
    ? { ...event.state, tradeOffers: carriedTradeOffers }
    : event.state;
  const { tradeOffers: _carried, state: _state, ...rest } = event;
  return {
    normalizedState: normalizeGameState(rawState),
    rest,
    logEntries: event.logEntries,
  };
}

/**
 * Single per-viewer scoping algorithm for game broadcasts. Operates on the
 * already-normalized state from `prepareScopableGameEvent` (so this step performs
 * NO normalization or mutation — it is a pure redaction). Runs
 * `toClientGameStateFromInternal` (which redacts trade offers / auctions /
 * handshakes / negotiation threads / affinity to the viewer's slice) and redacts
 * the log entries for the viewer. Returns a new event with `state` (and
 * `logEntries`, when present) replaced by the scoped versions; all other event
 * fields pass through unchanged. This is the ONE implementation of the DO
 * fan-out scoping so the transport layer never re-derives the redaction.
 */
export function scopeGameEventForViewer(
  prepared: PreparedGameEvent,
  viewer: BroadcastViewer,
): Record<string, unknown> {
  const scopedState = toClientGameStateFromInternal(
    prepared.normalizedState,
    viewer.spectator ? "spectator" : "player",
    viewer.viewerId,
  );
  const scopedLogEntries = prepared.logEntries
    ? redactLogEntriesForViewer(
        prepared.logEntries,
        viewer.spectator ? null : viewer.viewerId,
      )
    : undefined;

  return {
    ...prepared.rest,
    state: scopedState,
    ...(scopedLogEntries ? { logEntries: scopedLogEntries } : {}),
  };
}
