import type { GameState, PendingAuction } from "@oligopoly/validation";

/** Persisted `state_json` may include server-only affinity assignments. */
export type PersistedGameState = GameState & {
  affinityAssignments?: Record<string, string>;
  negotiationThreads?: Array<{
    id: string;
    partyIds: string[];
    status: string;
    visibility?: string;
  }>;
  handshakeAgreements?: Array<{
    id: string;
    partyA: string;
    partyB: string;
    summary: string;
    status: string;
    partySignatures?: Record<string, boolean>;
  }>;
  pendingInsiderPeek?: {
    cardId: string;
    drawingPlayerId: string;
  };
  settings?: {
    spectatorMode?: string;
    optionalRuleIds?: string[];
    [key: string]: unknown;
  };
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

export function redactPendingAuctionForBroadcast(
  auction: PendingAuction,
): PendingAuction & { submissionCount: number } {
  if (
    auction.auctionType === "open_bids" ||
    auction.auctionType === "live_bidding"
  ) {
    return withSubmissionCount(auction);
  }

  const { submissions: _submissions, ...rest } = auction;
  return {
    ...rest,
    submissions: {},
    submissionCount: Object.keys(auction.submissions).length,
  };
}

function redactPendingAuction(
  auction: PendingAuction,
  viewerId: string,
  mode: "spectator" | "player",
): ClientPendingAuction {
  if (
    auction.auctionType === "open_bids" ||
    auction.auctionType === "live_bidding"
  ) {
    return withSubmissionCount(auction);
  }

  const submissionCount = Object.keys(auction.submissions).length;
  if (mode === "spectator") {
    const { submissions: _submissions, ...rest } = auction;
    return { ...rest, submissions: {}, submissionCount };
  }

  const mySubmission = auction.submissions[viewerId];
  return {
    ...auction,
    submissions: {},
    submissionCount,
    ...(mySubmission !== undefined ? { mySubmission } : {}),
  };
}

function isOpenNegotiationRuleEnabled(
  settings: PersistedGameState["settings"],
): boolean {
  return Array.isArray(settings?.optionalRuleIds)
    ? settings.optionalRuleIds.includes("open_negotiation")
    : false;
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
    ? redactPendingAuction(state.pendingAuction, playerId, mode)
    : undefined;

  const openNegotiation = isOpenNegotiationRuleEnabled(state.settings);

  const negotiationThreads = filterNegotiationThreadsForViewer(
    state.negotiationThreads,
    playerId,
    mode,
    openNegotiation,
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
  openNegotiation: boolean,
) {
  if (!threads?.length) return threads;
  if (openNegotiation || mode === "spectator") return threads;
  return threads.filter((thread) => thread.partyIds.includes(viewerId));
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
