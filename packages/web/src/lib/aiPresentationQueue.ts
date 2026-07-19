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
  needsInteraction: boolean,
): AiPresentationQueueState {
  void viewerId;

  if (
    needsInteraction ||
    q.mode === "caught_up" ||
    (canonical.stateVersion ?? q.lastAppliedVersion) - q.lastAppliedVersion >
      q.queue.length + 1
  ) {
    return skipPresentation(q, canonical);
  }

  return q;
}

export function enqueueAiBeat(
  q: AiPresentationQueueState,
  beat: AiPresentationBeatEvent,
  canonical: GameState,
  needsInteraction: boolean,
): AiPresentationQueueState {
  if (needsInteraction) {
    return skipPresentation(q, canonical);
  }

  const latestPendingVersion =
    q.queue.at(-1)?.stateVersion ??
    q.currentBeat?.stateVersion ??
    q.lastAppliedVersion;
  if (
    beat.stateVersion <= q.lastAppliedVersion ||
    beat.stateVersion <= latestPendingVersion
  ) {
    return q;
  }

  if (q.currentBeat === null) {
    return {
      ...q,
      mode: "watching",
      presentationState: beat.state,
      currentBeat: beat,
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
    nowMs < q.currentBeat.sentAt + pauseMsFor(q.currentBeat)
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
    lastAppliedVersion: nextBeat.stateVersion,
  };
}
