import type {
  GameNegotiationThread,
  GameState,
  InGameHandshakeAgreement,
  PendingAuction,
  PendingInsiderPeek,
} from "@oligopoly/validation";

/** Persisted `state_json` may include server-only affinity assignments. */
export type PersistedGameState = GameState & {
  affinityAssignments?: Record<string, string>;
  negotiationThreads?: GameNegotiationThread[];
  handshakeAgreements?: InGameHandshakeAgreement[];
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
    myAffinityCardId?: string | null;
    pendingInsiderPeek?: PersistedGameState["pendingInsiderPeek"];
  },
): ClientGameState {
  const {
    affinityAssignments: _affinity,
    pendingAuction: _auction,
    pendingInsiderPeek: _peek,
    ...rest
  } = state;
  return {
    ...rest,
    ...(extras.pendingAuction ? { pendingAuction: extras.pendingAuction } : {}),
    negotiationThreads: extras.negotiationThreads,
    handshakeAgreements: extras.handshakeAgreements,
    ...(extras.myAffinityCardId !== undefined
      ? { myAffinityCardId: extras.myAffinityCardId }
      : {}),
    ...(extras.pendingInsiderPeek
      ? { pendingInsiderPeek: extras.pendingInsiderPeek }
      : {}),
  };
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
    ...(mode === "player"
      ? { myAffinityCardId, pendingInsiderPeek: insiderPeek }
      : {}),
  });
}

function filterNegotiationThreadsForViewer(
  threads: PersistedGameState["negotiationThreads"],
  viewerId: string,
  mode: "spectator" | "player",
) {
  if (!threads?.length) return threads;
  if (mode === "spectator") return threads;
  return threads.filter(
    (thread) =>
      thread.visibility === "open" || thread.partyIds.includes(viewerId),
  );
}

function filterHandshakesForViewer(
  handshakes: PersistedGameState["handshakeAgreements"],
  viewerId: string,
  mode: "spectator" | "player",
) {
  if (!handshakes?.length) return handshakes;
  if (mode === "spectator") return handshakes;
  return handshakes.filter(
    (entry) => entry.partyA === viewerId || entry.partyB === viewerId,
  );
}
