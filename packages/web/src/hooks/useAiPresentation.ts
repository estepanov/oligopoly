import type { GameState } from "@oligopoly/validation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AiPresentationBeatInput,
  type AiPresentationQueueState,
  advancePresentation,
  bufferAiAction,
  createPresentationQueue,
  enqueueAiBeat,
  enqueueCanonical,
  pauseMsFor,
  skipPresentation,
} from "../lib/aiPresentationQueue";

export type { AiPresentationBeatInput } from "../lib/aiPresentationQueue";

/**
 * Owns the client-local AI presentation queue (see `aiPresentationQueue.ts`)
 * and the timer that paces material/soft-turn-end beats. The reducer itself
 * stays pure and timer-free; this hook is the only place that schedules
 * `setTimeout` for `advancePresentation`.
 *
 * Callers must pass a game-scoped canonical snapshot (or null) — typically
 * `state?.gameId === routeGameId ? state : null` — and remount the session
 * owner when the route game changes so this hook never has to reconcile two
 * tables. The only remaining gameId invariant lives in the reducer:
 * `beat.gameId === canonical.gameId`.
 *
 * `urgentObligation` (auction bid owed / pending inbound trade — see
 * `viewerHasUrgentObligation`) forces an immediate catch-up. Canonical "my
 * turn" alone deliberately does not.
 */
export function useAiPresentation(
  canonical: GameState | null,
  urgentObligation: boolean,
) {
  const [queue, setQueue] = useState<AiPresentationQueueState>(() =>
    createPresentationQueue(canonical),
  );
  const canonicalRef = useRef(canonical);
  canonicalRef.current = canonical;

  useEffect(() => {
    if (!canonical) {
      setQueue(createPresentationQueue(null));
      return;
    }
    setQueue((current) =>
      enqueueCanonical(current, canonical, urgentObligation, Date.now()),
    );
  }, [canonical, urgentObligation]);

  const pushAiAction = useCallback(
    (beatInput: AiPresentationBeatInput) => {
      setQueue((current) => {
        const latestCanonical = canonicalRef.current;
        // Fast path: canonical already reflects this beat's `stateVersion`
        // (the common case — `action_applied` committed before `ai_action`).
        // Same-tick races buffer here and flush from `enqueueCanonical`.
        if (
          latestCanonical &&
          latestCanonical.gameId === beatInput.gameId &&
          latestCanonical.stateVersion === beatInput.stateVersion
        ) {
          return enqueueAiBeat(
            current,
            { ...beatInput, state: latestCanonical },
            latestCanonical,
            urgentObligation,
            Date.now(),
          );
        }
        return bufferAiAction(current, beatInput);
      });
    },
    [urgentObligation],
  );

  const skip = useCallback(() => {
    const latestCanonical = canonicalRef.current;
    if (!latestCanonical) return;
    setQueue((current) => skipPresentation(current, latestCanonical));
  }, []);

  const { currentBeat, currentBeatPresentedAtMs } = queue;
  useEffect(() => {
    const latestCanonical = canonicalRef.current;
    if (!currentBeat || currentBeatPresentedAtMs === null || !latestCanonical) {
      return;
    }
    const remainingMs = Math.max(
      0,
      currentBeatPresentedAtMs + pauseMsFor(currentBeat) - Date.now(),
    );
    const timer = window.setTimeout(() => {
      setQueue((current) => {
        const canonicalForAdvance = canonicalRef.current;
        if (!canonicalForAdvance) return current;
        return advancePresentation(current, canonicalForAdvance, Date.now());
      });
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [currentBeat, currentBeatPresentedAtMs]);

  return {
    presentationState: queue.presentationState,
    presentationMode: queue.mode,
    currentPresentationBeat: queue.currentBeat,
    pushAiAction,
    skip,
  };
}
