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

/** A `game.ai_action` beat received before its matching canonical state
 * (same `stateVersion`) has arrived — everything but the `state` snapshot,
 * which `enqueueCanonical` fills in once that canonical update lands. */
export type PendingAiBeatInput = Omit<AiPresentationBeatEvent, "state">;

export type AiPresentationQueueState = {
  mode: PresentationMode;
  presentationState: GameState | null;
  queue: AiPresentationBeatEvent[];
  currentBeat: AiPresentationBeatEvent | null;
  currentBeatPresentedAtMs: number | null;
  canonicalPendingBeatVersion: number | null;
  lastAppliedVersion: number;
  /** AI beats whose matching canonical `stateVersion` hasn't arrived yet —
   * `game.ai_action` and `game.action_applied`/snapshot events can arrive
   * over WS in either order. Flushed by `enqueueCanonical`. */
  pendingAiByVersion: Map<number, PendingAiBeatInput>;
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
    pendingAiByVersion: new Map(),
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

/** Buffer an AI beat that arrived before its matching canonical state. Stale
 * or matched entries are reaped by `enqueueCanonical`, not here. */
export function bufferAiAction(
  q: AiPresentationQueueState,
  beatInput: PendingAiBeatInput,
): AiPresentationQueueState {
  const pendingAiByVersion = new Map(q.pendingAiByVersion);
  pendingAiByVersion.set(beatInput.stateVersion, beatInput);
  return { ...q, pendingAiByVersion };
}

export function enqueueCanonical(
  q: AiPresentationQueueState,
  canonical: GameState,
  urgentObligation: boolean,
  nowMs: number,
): AiPresentationQueueState {
  const canonicalVersion = canonical.stateVersion;

  // Reap any buffered AI beat at or below this version: an exact match pairs
  // with this canonical update; anything strictly older is stale (superseded
  // by a version bump the client never got a matching beat for) and is
  // dropped rather than left to leak into a future, unrelated pairing.
  const pendingAiByVersion = new Map(q.pendingAiByVersion);
  let matchedBeat: PendingAiBeatInput | undefined;
  for (const [version, beatInput] of pendingAiByVersion) {
    if (version > canonicalVersion) continue;
    pendingAiByVersion.delete(version);
    if (version === canonicalVersion) matchedBeat = beatInput;
  }
  const base: AiPresentationQueueState = { ...q, pendingAiByVersion };

  // A buffered beat pairing with this exact canonical update takes the same
  // path a same-tick beat would (`enqueueAiBeat`, including its own urgent-
  // obligation handling) — it is NOT subject to the version-gap catch-up
  // check below, since it is a fully paired, in-order beat, not a jump.
  if (matchedBeat) {
    return enqueueAiBeat(
      base,
      { ...matchedBeat, state: canonical },
      canonical,
      urgentObligation,
      nowMs,
    );
  }

  // Note: canonical `isMyTurn` alone must NOT land here — only an urgent
  // mid-loop obligation (auction bid owed, pending inbound trade) or a
  // version gap too large for the queue to bridge force an immediate
  // catch-up. Otherwise queued/current AI beats would be discarded the
  // instant canonical flips to the viewer's turn, even though the loop that
  // produced them already finished server-side.
  if (
    urgentObligation ||
    canonicalVersion - base.lastAppliedVersion > base.queue.length + 1
  ) {
    return skipPresentation(base, canonical);
  }

  if (base.mode === "caught_up") {
    if (canonicalVersion > base.lastAppliedVersion) {
      return {
        ...base,
        presentationState: canonical,
        canonicalPendingBeatVersion: canonicalVersion,
        lastAppliedVersion: canonicalVersion,
      };
    }

    return {
      ...base,
      presentationState: canonical,
    };
  }

  return base;
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
    lastAppliedVersion: canonical.stateVersion,
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
