import type { InternalGameState } from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import {
  type ClientPendingAuction,
  filterHandshakesForViewer,
  filterNegotiationThreadsForViewer,
  filterTradeOffersForViewer,
  type PersistedGameState,
  redactPendingAuctionByMode,
  type ViewerMode,
} from "./services/gameVisibilityFilters.js";

// NOTE: the broadcast privacy contract lives in `./services/gameBroadcastVisibility.js`
// and is imported directly by its consumers (rooms, persistence, gameAi, tests).
// `gameStateView.ts` intentionally does NOT re-export it: `gameBroadcastVisibility`
// imports `toClientGameStateFromInternal` from here, so re-exporting it back would
// create an import cycle. The dependency flows one way: gameBroadcastVisibility →
// gameStateView (+ gameVisibilityFilters), gameStateView → gameVisibilityFilters.
// Re-exports below are only the per-viewer client-view helpers (no back-edge).
export type {
  PersistedGameState,
  ViewerMode,
} from "./services/gameVisibilityFilters.js";
export {
  redactLogEntriesForViewer,
  redactPendingAuctionForBroadcast,
} from "./services/gameVisibilityFilters.js";

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
  mode: ViewerMode,
  playerId: string,
): ClientGameState {
  return toClientGameState(
    state as unknown as PersistedGameState,
    mode,
    playerId,
  );
}

/**
 * Compile the per-viewer client view: redact each privacy-sensitive field
 * (auction submissions, negotiation threads, handshakes, trade offers, insider
 * peek, affinity) down to the viewer's slice via the per-domain filters in
 * `gameVisibilityFilters.ts`, then assemble the wire shape.
 *
 * Callers must enforce authZ (player vs spectator) before using this.
 */
export function toClientGameState(
  state: PersistedGameState,
  mode: ViewerMode,
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
