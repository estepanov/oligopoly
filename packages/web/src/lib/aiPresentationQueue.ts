import type { GameState } from "@oligopoly/validation";

export type PresentationMode = "watching" | "caught_up";

export type AiPresentationBeatEvent = {
  /** Must match the session/canonical `gameId` before a beat may pair or present. */
  gameId: string;
  stateVersion: number;
  state: GameState;
  aiPlayerId: string;
  displayName?: string;
  material: boolean;
  softTurnEnd: boolean;
  summary?: string;
  sentAt: number;
};

/** A `game.ai_action` beat received before its matching canonical state
 * (same `stateVersion`) has arrived — everything but the `state` snapshot,
 * which pairing fills in once that canonical update lands. This is the ONE
 * beat-input shape used end-to-end: realtime (`useGameRealtime`) → session
 * (`useGameSession`) → this queue. */
export type AiPresentationBeatInput = Omit<AiPresentationBeatEvent, "state">;

/** The half of an AI-beat/canonical-state pair that has arrived so far, keyed
 * by `stateVersion` in `pendingByVersion`. Whichever side is missing is
 * filled in by the OTHER side's handler once it arrives at the same version:
 * an AI-side entry is completed by `enqueueCanonical`, a canonical-side entry
 * is completed by `enqueueAiBeat` (reached via `useAiPresentation`'s
 * same-version fast path). Replaces the former dual bookkeeping of a
 * standalone `canonicalPendingBeatVersion` scalar plus a `pendingAiByVersion`
 * map — one structure, one lookup, one place to clear on skip/reset. */
export type PendingHalf =
  | { side: "ai"; beat: AiPresentationBeatInput }
  | { side: "canonical"; state: GameState };

export type AiPresentationQueueState = {
  mode: PresentationMode;
  presentationState: GameState | null;
  queue: AiPresentationBeatEvent[];
  currentBeat: AiPresentationBeatEvent | null;
  currentBeatPresentedAtMs: number | null;
  lastAppliedVersion: number;
  pendingByVersion: Map<number, PendingHalf>;
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
    lastAppliedVersion: canonical?.stateVersion ?? 0,
    pendingByVersion: new Map(),
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

function withoutPendingVersion(
  pendingByVersion: Map<number, PendingHalf>,
  version: number,
): Map<number, PendingHalf> {
  if (!pendingByVersion.has(version)) return pendingByVersion;
  const next = new Map(pendingByVersion);
  next.delete(version);
  return next;
}

/** Buffer an AI beat that arrived before its matching canonical state. Stale
 * or matched entries are reaped by `enqueueCanonical`, not here. */
export function bufferAiAction(
  q: AiPresentationQueueState,
  beatInput: AiPresentationBeatInput,
): AiPresentationQueueState {
  const pendingByVersion = new Map(q.pendingByVersion);
  pendingByVersion.set(beatInput.stateVersion, {
    side: "ai",
    beat: beatInput,
  });
  return { ...q, pendingByVersion };
}

export function enqueueCanonical(
  q: AiPresentationQueueState,
  canonical: GameState,
  urgentObligation: boolean,
  nowMs: number,
): AiPresentationQueueState {
  const canonicalVersion = canonical.stateVersion;

  // Reap any pending half at or below this version: an AI-side entry at
  // exactly this version pairs with this canonical update only when its
  // `gameId` matches. A same-version half for another game is dropped and
  // must not be treated as "no beat" for version-gap catch-up below.
  const pendingByVersion = new Map(q.pendingByVersion);
  let matchedBeat: AiPresentationBeatInput | undefined;
  let rejectedForeignSameVersionAi = false;
  for (const [version, half] of pendingByVersion) {
    if (version > canonicalVersion) continue;
    pendingByVersion.delete(version);
    if (version === canonicalVersion && half.side === "ai") {
      if (half.beat.gameId === canonical.gameId) {
        matchedBeat = half.beat;
      } else {
        rejectedForeignSameVersionAi = true;
      }
    }
  }
  const base: AiPresentationQueueState = { ...q, pendingByVersion };

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

  // Fail closed: a foreign same-version AI half was reaped. Returning `base`
  // avoids the version-gap branch treating the empty slot as a missing beat
  // and calling `skipPresentation`. (Route remount + render-scoped state
  // should make this rare; this is the reducer backstop.)
  if (rejectedForeignSameVersionAi) {
    return base;
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
    if (canonicalVersion < base.lastAppliedVersion) {
      // Duplicate/out-of-order realtime must not rewind the board after Skip
      // or a later beat already advanced presentation bookkeeping.
      return base;
    }
    if (canonicalVersion > base.lastAppliedVersion) {
      // No AI beat has arrived for this version yet — record the canonical
      // half so a same-version beat arriving via `useAiPresentation`'s
      // same-tick fast path (which calls `enqueueAiBeat` directly, bypassing
      // this function) still recognizes it as a pairing rather than a stale
      // duplicate.
      const nextPending = new Map(base.pendingByVersion);
      nextPending.set(canonicalVersion, {
        side: "canonical",
        state: canonical,
      });
      return {
        ...base,
        presentationState: canonical,
        pendingByVersion: nextPending,
        lastAppliedVersion: canonicalVersion,
      };
    }

    // Same version: refresh presentation (e.g. auction `mySubmission` merge)
    // without treating it as a new advance.
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

  if (
    beat.gameId !== canonical.gameId ||
    beat.state.gameId !== canonical.gameId
  ) {
    return q;
  }

  const pendingHalf = q.pendingByVersion.get(beat.stateVersion);
  const pairsWithPendingCanonical =
    q.mode === "caught_up" &&
    q.currentBeat === null &&
    pendingHalf?.side === "canonical" &&
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

  const pendingByVersion = pairsWithPendingCanonical
    ? withoutPendingVersion(q.pendingByVersion, beat.stateVersion)
    : q.pendingByVersion;

  if (q.currentBeat === null) {
    return {
      ...q,
      pendingByVersion,
      mode: "watching",
      presentationState: beat.state,
      currentBeat: beat,
      currentBeatPresentedAtMs: nowMs,
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
    pendingByVersion,
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
    // Clear BOTH half-pair buffers, not just the current one — a stale
    // buffered AI beat left behind here would otherwise re-enter "watching"
    // the moment a later `enqueueCanonical` call reaches its version.
    pendingByVersion: new Map(),
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
    lastAppliedVersion: nextBeat.stateVersion,
  };
}
