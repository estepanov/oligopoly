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

/**
 * Strip hidden affinity data for HTTP responses.
 * Callers must enforce authZ (player vs spectator) before using this.
 */
export function toClientGameState(
  state: PersistedGameState,
  mode: "spectator" | "player",
  playerId: string,
): Record<string, unknown> {
  const pendingAuction = state.pendingAuction
    ? redactPendingAuction(state.pendingAuction, playerId, mode)
    : undefined;

  const openNegotiation = Array.isArray(state.settings?.optionalRuleIds)
    ? state.settings.optionalRuleIds.includes("open_negotiation")
    : false;

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
    openNegotiation,
  );

  const insiderPeek =
    state.pendingInsiderPeek?.drawingPlayerId === playerId
      ? state.pendingInsiderPeek
      : undefined;

  if (mode === "spectator") {
    const {
      affinityAssignments: _a,
      pendingAuction: _p,
      pendingInsiderPeek: _peek,
      ...rest
    } = state;
    return {
      ...rest,
      ...(pendingAuction ? { pendingAuction } : {}),
      negotiationThreads,
      handshakeAgreements,
    };
  }

  if (state.affinityAssignments) {
    const myAffinity = state.affinityAssignments[playerId] ?? null;
    const {
      affinityAssignments: _all,
      pendingAuction: _p,
      pendingInsiderPeek: _peek,
      ...rest
    } = state;
    return {
      ...rest,
      ...(pendingAuction ? { pendingAuction } : {}),
      myAffinityCardId: myAffinity,
      negotiationThreads,
      handshakeAgreements,
      ...(insiderPeek ? { pendingInsiderPeek: insiderPeek } : {}),
    } as Record<string, unknown>;
  }

  const { pendingAuction: _p, pendingInsiderPeek: _peek, ...rest } = state;
  return {
    ...rest,
    ...(pendingAuction ? { pendingAuction } : {}),
    negotiationThreads,
    handshakeAgreements,
    ...(insiderPeek ? { pendingInsiderPeek: insiderPeek } : {}),
  } as Record<string, unknown>;
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
  openNegotiation: boolean,
) {
  if (!handshakes?.length) return handshakes;
  if (openNegotiation || mode === "spectator") return handshakes;
  return handshakes.filter(
    (entry) => entry.partyA === viewerId || entry.partyB === viewerId,
  );
}
