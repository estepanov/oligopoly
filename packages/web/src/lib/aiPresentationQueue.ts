import type { GameState } from "@oligopoly/validation";

export type PresentationMode = "watching" | "caught_up";

export type AiPresentationBeatEvent = {
  stateVersion: number;
  state: GameState;
  aiPlayerId: string;
  displayName?: string;
  material: boolean;
  softTurnEnd: boolean;
  summary: string;
  sentAt: number;
};

export type AiPresentationQueueState = {
  mode: PresentationMode;
  presentationState: GameState | null;
  queue: AiPresentationBeatEvent[];
  currentBeat: AiPresentationBeatEvent | null;
  currentBeatPresentedAtMs: number | null;
  canonicalPendingBeatVersion: number | null;
  lastAppliedVersion: number;
};

export const MATERIAL_PAUSE_MS = 1200;
export const SOFT_TURN_END_PAUSE_MS = 600;
export const NON_MATERIAL_PAUSE_MS = 200;
export const QUEUE_CAP = 50;
export const LAG_BUDGET_MS = 8000;

export function createPresentationQueue(
  canonical: GameState | null,
): AiPresentationQueueState {
  return {
    mode: "caught_up",
    presentationState: canonical,
    queue: [],
    currentBeat: null,
    currentBeatPresentedAtMs: null,
    canonicalPendingBeatVersion: null,
    lastAppliedVersion: canonical?.stateVersion ?? 0,
  };
}

export function pauseMsFor(beat: AiPresentationBeatEvent): number {
  if (beat.softTurnEnd) {
    return SOFT_TURN_END_PAUSE_MS;
  }
  if (beat.material) {
    return MATERIAL_PAUSE_MS;
  }
  return NON_MATERIAL_PAUSE_MS;
}

export function enqueueCanonical(
  q: AiPresentationQueueState,
  canonical: GameState,
  viewerId: string | null,
  urgentObligation: boolean,
): AiPresentationQueueState {
  void viewerId;

  // Note: canonical `isMyTurn` alone must NOT land here — only an urgent
  // mid-loop obligation (auction bid owed, pending inbound trade) or a
  // version gap too large for the queue to bridge force an immediate
  // catch-up. Otherwise queued/current AI beats would be discarded the
  // instant canonical flips to the viewer's turn, even though the loop that
  // produced them already finished server-side. See `viewerCanActOnOwnTurn`.
  if (
    urgentObligation ||
    (canonical.stateVersion ?? q.lastAppliedVersion) - q.lastAppliedVersion >
      q.queue.length + 1
  ) {
    return skipPresentation(q, canonical);
  }

  if (q.mode === "caught_up") {
    const canonicalVersion = canonical.stateVersion ?? q.lastAppliedVersion;
    if (canonicalVersion > q.lastAppliedVersion) {
      return {
        ...q,
        presentationState: canonical,
        canonicalPendingBeatVersion: canonicalVersion,
        lastAppliedVersion: canonicalVersion,
      };
    }

    return {
      ...q,
      presentationState: canonical,
    };
  }

  return q;
}

export function enqueueAiBeat(
  q: AiPresentationQueueState,
  beat: AiPresentationBeatEvent,
  canonical: GameState,
  urgentObligation: boolean,
  nowMs: number,
): AiPresentationQueueState {
  // Same rationale as `enqueueCanonical`: only an urgent obligation forces
  // an immediate skip here. A canonical "my turn" alone must not drop AI
  // beats that already arrived — let them present, then catch up naturally
  // once the queue drains (see `advancePresentation`).
  if (urgentObligation) {
    return skipPresentation(q, canonical);
  }

  const pairsWithPendingCanonical =
    q.mode === "caught_up" &&
    q.currentBeat === null &&
    q.canonicalPendingBeatVersion === beat.stateVersion &&
    q.lastAppliedVersion === beat.stateVersion;
  const latestPendingVersion =
    q.queue.at(-1)?.stateVersion ??
    q.currentBeat?.stateVersion ??
    q.lastAppliedVersion;
  if (
    beat.stateVersion < q.lastAppliedVersion ||
    (beat.stateVersion === q.lastAppliedVersion &&
      !pairsWithPendingCanonical) ||
    (beat.stateVersion <= latestPendingVersion && !pairsWithPendingCanonical)
  ) {
    return q;
  }

  if (q.currentBeat === null) {
    return {
      ...q,
      mode: "watching",
      presentationState: beat.state,
      currentBeat: beat,
      currentBeatPresentedAtMs: nowMs,
      canonicalPendingBeatVersion: null,
      lastAppliedVersion: beat.stateVersion,
    };
  }

  const pendingBeatCount = q.queue.length + 1;
  const eventTimeLag = beat.sentAt - q.currentBeat.sentAt;
  if (pendingBeatCount >= QUEUE_CAP || eventTimeLag > LAG_BUDGET_MS) {
    return skipPresentation(q, canonical);
  }

  return {
    ...q,
    queue: [...q.queue, beat],
  };
}

export function skipPresentation(
  q: AiPresentationQueueState,
  canonical: GameState,
): AiPresentationQueueState {
  return {
    ...q,
    mode: "caught_up",
    presentationState: canonical,
    queue: [],
    currentBeat: null,
    currentBeatPresentedAtMs: null,
    canonicalPendingBeatVersion: null,
    lastAppliedVersion: canonical.stateVersion ?? q.lastAppliedVersion,
  };
}

export function advancePresentation(
  q: AiPresentationQueueState,
  canonical: GameState,
  nowMs: number,
): AiPresentationQueueState {
  if (
    q.currentBeat === null ||
    q.currentBeatPresentedAtMs === null ||
    nowMs < q.currentBeatPresentedAtMs + pauseMsFor(q.currentBeat)
  ) {
    return q;
  }

  const [nextBeat, ...remainingQueue] = q.queue;
  if (nextBeat === undefined) {
    return skipPresentation(q, canonical);
  }

  return {
    ...q,
    mode: "watching",
    presentationState: nextBeat.state,
    queue: remainingQueue,
    currentBeat: nextBeat,
    currentBeatPresentedAtMs: nowMs,
    canonicalPendingBeatVersion: null,
    lastAppliedVersion: nextBeat.stateVersion,
  };
}
