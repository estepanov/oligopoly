import type { InternalGameState } from "@oligopoly/shared";
import { normalizeGameState } from "@oligopoly/shared";
import type {
  GameLogEntry,
  GameNegotiationThread,
  GameState,
  InGameHandshakeAgreement,
  PendingAuction,
  PendingInsiderPeek,
  TradeOffer,
} from "@oligopoly/validation";

/**
 * Log action types whose payloads carry private trade terms (capital/tiles and
 * the two party ids). Only the proposer and recipient may see these entries;
 * everyone else (other players + spectators) must not receive them at all —
 * mirroring how `filterTradeOffersForViewer` hides offer state itself.
 */
const PRIVATE_TRADE_LOG_ACTIONS = new Set([
  "trade_proposed",
  "trade_accepted",
  "trade_rejected",
  "trade_expired",
  "trade_countered",
]);

function isTradeParticipant(
  payload: GameLogEntry["payload"],
  viewerId: string,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const { proposerId, recipientId } = payload as {
    proposerId?: unknown;
    recipientId?: unknown;
  };
  return proposerId === viewerId || recipientId === viewerId;
}

/**
 * Drop private trade log entries for viewers that are not a party to the trade.
 * `viewerId` is the player id for player views, or `null`/spectator for
 * spectators (who never participate, so all private trade entries are removed).
 */
export function redactLogEntriesForViewer<
  TEntry extends Pick<GameLogEntry, "actionType" | "payload">,
>(entries: TEntry[], viewerId: string | null): TEntry[] {
  return entries.filter((entry) => {
    if (!PRIVATE_TRADE_LOG_ACTIONS.has(entry.actionType)) return true;
    return viewerId !== null && isTradeParticipant(entry.payload, viewerId);
  });
}

/** Persisted `state_json` may include server-only affinity assignments. */
export type PersistedGameState = GameState & {
  affinityAssignments?: Record<string, string>;
  negotiationThreads?: GameNegotiationThread[];
  handshakeAgreements?: InGameHandshakeAgreement[];
  tradeOffers?: TradeOffer[];
  pendingInsiderPeek?: PendingInsiderPeek | null;
};

type ClientPendingAuction = PendingAuction & {
  submissionCount: number;
  mySubmission?: number | "pass";
};

/** HTTP/WS game state after affinity redaction and visibility filtering. */
export type ClientGameState = Omit<
  GameState,
  "pendingAuction" | "affinityAssignments"
> & {
  pendingAuction?: ClientPendingAuction;
  myAffinityCardId?: string | null;
  negotiationThreads?: PersistedGameState["negotiationThreads"];
  handshakeAgreements?: PersistedGameState["handshakeAgreements"];
  tradeOffers?: PersistedGameState["tradeOffers"];
  pendingInsiderPeek?: PersistedGameState["pendingInsiderPeek"];
};

function withSubmissionCount(auction: PendingAuction): ClientPendingAuction {
  return {
    ...auction,
    submissionCount: Object.keys(auction.submissions).length,
  };
}

function redactPendingAuctionByMode(
  auction: PendingAuction,
  mode: "broadcast" | "spectator" | "player",
  viewerId?: string,
): ClientPendingAuction {
  if (
    auction.auctionType === "open_bids" ||
    auction.auctionType === "live_bidding"
  ) {
    return withSubmissionCount(auction);
  }

  const submissionCount = Object.keys(auction.submissions).length;
  if (mode !== "player") {
    const { submissions: _submissions, ...rest } = auction;
    return { ...rest, submissions: {}, submissionCount };
  }

  if (!viewerId) {
    throw new Error("viewerId is required for player auction redaction");
  }
  const mySubmission = auction.submissions[viewerId];
  return {
    ...auction,
    submissions: {},
    submissionCount,
    ...(mySubmission !== undefined ? { mySubmission } : {}),
  };
}

export function redactPendingAuctionForBroadcast(
  auction: PendingAuction,
): ClientPendingAuction {
  return redactPendingAuctionByMode(auction, "broadcast");
}
function buildClientGameStateBase(
  state: PersistedGameState,
  extras: {
    pendingAuction?: ClientPendingAuction;
    negotiationThreads: PersistedGameState["negotiationThreads"];
    handshakeAgreements: PersistedGameState["handshakeAgreements"];
    tradeOffers: PersistedGameState["tradeOffers"];
    myAffinityCardId?: string | null;
    pendingInsiderPeek?: PersistedGameState["pendingInsiderPeek"];
  },
): ClientGameState {
  const {
    affinityAssignments: _affinity,
    pendingAuction: _auction,
    pendingInsiderPeek: _peek,
    tradeOffers: _tradeOffers,
    ...rest
  } = state;
  return {
    ...rest,
    ...(extras.pendingAuction ? { pendingAuction: extras.pendingAuction } : {}),
    negotiationThreads: extras.negotiationThreads,
    handshakeAgreements: extras.handshakeAgreements,
    tradeOffers: extras.tradeOffers,
    ...(extras.myAffinityCardId !== undefined
      ? { myAffinityCardId: extras.myAffinityCardId }
      : {}),
    ...(extras.pendingInsiderPeek
      ? { pendingInsiderPeek: extras.pendingInsiderPeek }
      : {}),
  };
}

/**
 * Typed bridge from the engine's `InternalGameState` (what `normalizeGameState`
 * returns) to the client view. `InternalGameState` is a structural superset of
 * `PersistedGameState` — it carries every wire field, but a handful of branches
 * use looser server-internal typings (e.g. `BindingContract.partySignatures` is
 * `Partial<Record<…>>` internally vs `Record<…>` on the validation type, and
 * `pendingAuction`/`settings` are engine variants). `toClientGameState` only
 * reads the redaction-relevant fields, which are wire-identical, so we reconcile
 * the difference ONCE here at the normalization boundary instead of casting at
 * every per-viewer broadcast iteration (where casting at the privacy boundary is
 * risky). This is the single sanctioned bridge between the two type families.
 */
export function toClientGameStateFromInternal(
  state: InternalGameState,
  mode: "spectator" | "player",
  playerId: string,
): ClientGameState {
  return toClientGameState(
    state as unknown as PersistedGameState,
    mode,
    playerId,
  );
}

/**
 * Strip hidden affinity data for HTTP responses.
 * Callers must enforce authZ (player vs spectator) before using this.
 */
export function toClientGameState(
  state: PersistedGameState,
  mode: "spectator" | "player",
  playerId: string,
): ClientGameState {
  const pendingAuction = state.pendingAuction
    ? redactPendingAuctionByMode(state.pendingAuction, mode, playerId)
    : undefined;

  const negotiationThreads = filterNegotiationThreadsForViewer(
    state.negotiationThreads,
    playerId,
    mode,
  );

  const handshakeAgreements = filterHandshakesForViewer(
    state.handshakeAgreements,
    playerId,
    mode,
  );

  const tradeOffers = filterTradeOffersForViewer(
    state.tradeOffers,
    playerId,
    mode,
  );

  const insiderPeek =
    mode === "player" && state.pendingInsiderPeek?.drawingPlayerId === playerId
      ? state.pendingInsiderPeek
      : undefined;

  const myAffinityCardId =
    mode === "player"
      ? (state.affinityAssignments?.[playerId] ?? null)
      : undefined;

  return buildClientGameStateBase(state, {
    pendingAuction,
    negotiationThreads,
    handshakeAgreements,
    tradeOffers,
    ...(mode === "player"
      ? { myAffinityCardId, pendingInsiderPeek: insiderPeek }
      : {}),
  });
}

/**
 * Shared party/spectator visibility filter. Returns the input untouched when it
 * is empty/undefined; otherwise keeps each item that `isVisible(item, viewerId,
 * mode)` accepts. Each item's predicate decides whether spectators see it (so
 * e.g. open negotiation threads stay visible to spectators while private trade
 * offers/handshakes are hidden).
 */
function filterVisibleToViewer<TItem>(
  items: TItem[] | undefined,
  viewerId: string,
  mode: "spectator" | "player",
  isVisible: (
    item: TItem,
    viewerId: string,
    mode: "spectator" | "player",
  ) => boolean,
): TItem[] | undefined {
  if (!items?.length) return items;
  return items.filter((item) => isVisible(item, viewerId, mode));
}

function filterTradeOffersForViewer(
  offers: PersistedGameState["tradeOffers"],
  viewerId: string,
  mode: "spectator" | "player",
) {
  return filterVisibleToViewer(offers, viewerId, mode, (offer, id, m) =>
    m === "spectator"
      ? false
      : offer.proposerId === id || offer.recipientId === id,
  );
}

function filterNegotiationThreadsForViewer(
  threads: PersistedGameState["negotiationThreads"],
  viewerId: string,
  mode: "spectator" | "player",
) {
  return filterVisibleToViewer(threads, viewerId, mode, (thread, id, m) =>
    m === "spectator"
      ? thread.visibility === "open"
      : thread.visibility === "open" || thread.partyIds.includes(id),
  );
}

function filterHandshakesForViewer(
  handshakes: PersistedGameState["handshakeAgreements"],
  viewerId: string,
  mode: "spectator" | "player",
) {
  return filterVisibleToViewer(handshakes, viewerId, mode, (entry, id, m) =>
    m === "spectator" ? false : entry.partyA === id || entry.partyB === id,
  );
}

/** Identifies the WebSocket session a broadcast event is being scoped for. */
export interface BroadcastViewer {
  viewerId: string;
  spectator: boolean;
}

/**
 * A realtime game event as it travels on the wire BEFORE per-viewer scoping. The
 * broadcast source strips private `tradeOffers` terms off `state` and carries
 * them on the separate `tradeOffers` field (see `prepareGameBroadcastPayload`);
 * `scopeGameEventForViewer` re-injects them per viewer and redacts everything
 * down to the viewer's own slice. Extra event fields (type, sentAt, gameId, …)
 * are preserved untouched.
 */
export interface ScopableGameEvent {
  state: Record<string, unknown>;
  tradeOffers?: unknown;
  logEntries?: Array<Pick<GameLogEntry, "actionType" | "payload">>;
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
