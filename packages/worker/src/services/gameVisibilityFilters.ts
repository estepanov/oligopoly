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
 * Per-domain visibility filters for the client/broadcast view. Each filter
 * decides what a given viewer (player or spectator) is allowed to see for one
 * privacy-sensitive field. `gameStateView.ts` is a thin orchestrator that
 * composes these; keep the per-field redaction rules here so they live next to
 * their data shape rather than scattered through the compiler.
 */

export type ViewerMode = "spectator" | "player";

/** Persisted `state_json` may include server-only affinity assignments. */
export type PersistedGameState = GameState & {
  affinityAssignments?: Record<string, string>;
  negotiationThreads?: GameNegotiationThread[];
  handshakeAgreements?: InGameHandshakeAgreement[];
  tradeOffers?: TradeOffer[];
  pendingInsiderPeek?: PendingInsiderPeek | null;
};

export type ClientPendingAuction = PendingAuction & {
  submissionCount: number;
  mySubmission?: number | "pass";
};

// ---------------------------------------------------------------------------
// Pending auction
// ---------------------------------------------------------------------------

function withSubmissionCount(auction: PendingAuction): ClientPendingAuction {
  return {
    ...auction,
    submissionCount: Object.keys(auction.submissions).length,
  };
}

export function redactPendingAuctionByMode(
  auction: PendingAuction,
  mode: "broadcast" | ViewerMode,
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

// ---------------------------------------------------------------------------
// Party/spectator list filters
// ---------------------------------------------------------------------------

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
  mode: ViewerMode,
  isVisible: (item: TItem, viewerId: string, mode: ViewerMode) => boolean,
): TItem[] | undefined {
  if (!items?.length) return items;
  return items.filter((item) => isVisible(item, viewerId, mode));
}

export function filterTradeOffersForViewer(
  offers: PersistedGameState["tradeOffers"],
  viewerId: string,
  mode: ViewerMode,
) {
  return filterVisibleToViewer(offers, viewerId, mode, (offer, id, m) =>
    m === "spectator"
      ? false
      : offer.proposerId === id || offer.recipientId === id,
  );
}

export function filterNegotiationThreadsForViewer(
  threads: PersistedGameState["negotiationThreads"],
  viewerId: string,
  mode: ViewerMode,
) {
  return filterVisibleToViewer(threads, viewerId, mode, (thread, id, m) =>
    m === "spectator"
      ? thread.visibility === "open"
      : thread.visibility === "open" || thread.partyIds.includes(id),
  );
}

export function filterHandshakesForViewer(
  handshakes: PersistedGameState["handshakeAgreements"],
  viewerId: string,
  mode: ViewerMode,
) {
  return filterVisibleToViewer(handshakes, viewerId, mode, (entry, id, m) =>
    m === "spectator" ? false : entry.partyA === id || entry.partyB === id,
  );
}

// ---------------------------------------------------------------------------
// Log entries
// ---------------------------------------------------------------------------

/**
 * Log action types whose payloads carry private trade terms (capital/tiles and
 * the two party ids). Only the proposer and recipient may see these entries;
 * everyone else (other players + spectators) must not receive them at all —
 * mirroring how `filterTradeOffersForViewer` hides offer state itself.
 *
 * There is no shared constant to derive this from: `GameLogEntry.actionType` is a
 * free-form `z.string()`, and the emission sites live in the `@oligopoly/shared`
 * engine, not this worker package. So this list MUST be kept in sync by hand with
 * every `trade_*` log line emitted in `packages/shared/src/engine/tradeActions.ts`
 * (search `actionType:`/`logActionType:` there — currently `trade_proposed`,
 * `trade_accepted`, `trade_rejected`, `trade_expired`, `trade_countered`). If a
 * new private trade log type is added there, add it here too or it will leak to
 * non-parties.
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
