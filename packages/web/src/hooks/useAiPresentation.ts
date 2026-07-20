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
 * `urgentObligation` (auction bid owed / pending inbound trade — see
 * `viewerHasUrgentObligation`) forces an immediate catch-up. Canonical "my
 * turn" alone deliberately does not: it is derived from `enqueueCanonical` /
 * `enqueueAiBeat`'s own version bookkeeping instead, so a fast-finishing AI
 * turn loop does not drain already-queued beats out from under the viewer.
 */
export function useAiPresentation(
  canonical: GameState | null,
  urgentObligation: boolean,
  gameId: string | undefined,
) {
  const [queue, setQueue] = useState<AiPresentationQueueState>(() =>
    createPresentationQueue(canonical?.gameId === gameId ? canonical : null),
  );
  const canonicalRef = useRef(canonical);
  canonicalRef.current = canonical;
  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;

  // Tracks the game the queue was built for. A `gameId` change (SPA
  // navigation between tables without unmounting this hook) must throw away
  // any queued/buffered beats from the PREVIOUS game rather than risk
  // pairing a stale beat against the new game's canonical state at a
  // coincidentally-matching `stateVersion`.
  const previousGameIdRef = useRef<string | null>(gameId ?? null);

  useEffect(() => {
    const activeGameId = gameId ?? null;
    if (previousGameIdRef.current !== activeGameId) {
      previousGameIdRef.current = activeGameId;
      setQueue(
        createPresentationQueue(
          canonical && activeGameId && canonical.gameId === activeGameId
            ? canonical
            : null,
        ),
      );
      return;
    }

    if (!canonical || !activeGameId) {
      setQueue(createPresentationQueue(null));
      return;
    }

    // Session may briefly retain a prior table's snapshot while the route
    // `gameId` already changed — never pace/pair against that mismatch.
    if (canonical.gameId !== activeGameId) {
      return;
    }

    setQueue((current) =>
      enqueueCanonical(current, canonical, urgentObligation, Date.now()),
    );
  }, [canonical, urgentObligation, gameId]);

  const pushAiAction = useCallback(
    (beatInput: AiPresentationBeatInput) => {
      setQueue((current) => {
        const expectedGameId = gameIdRef.current;
        if (!expectedGameId || beatInput.gameId !== expectedGameId) {
          return current;
        }

        const latestCanonical = canonicalRef.current;
        // Fast path: canonical already reflects this beat's `stateVersion`
        // (the common, non-same-tick case — `action_applied` rendered in an
        // earlier, separate update before this `ai_action` arrived). Anything
        // else — including the same-tick race where this event fires before
        // React has committed the pairing canonical update — buffers here and
        // is flushed by `enqueueCanonical` once that canonical update lands.
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
    const expectedGameId = gameIdRef.current;
    if (
      !latestCanonical ||
      !expectedGameId ||
      latestCanonical.gameId !== expectedGameId
    ) {
      return;
    }
    setQueue((current) => skipPresentation(current, latestCanonical));
  }, []);

  const { currentBeat, currentBeatPresentedAtMs } = queue;
  useEffect(() => {
    const latestCanonical = canonicalRef.current;
    const expectedGameId = gameIdRef.current;
    if (
      !currentBeat ||
      currentBeatPresentedAtMs === null ||
      !latestCanonical ||
      !expectedGameId ||
      latestCanonical.gameId !== expectedGameId
    ) {
      return;
    }
    const remainingMs = Math.max(
      0,
      currentBeatPresentedAtMs + pauseMsFor(currentBeat) - Date.now(),
    );
    const timer = window.setTimeout(() => {
      setQueue((current) => {
        const canonicalForAdvance = canonicalRef.current;
        if (
          !canonicalForAdvance ||
          canonicalForAdvance.gameId !== gameIdRef.current
        ) {
          return current;
        }
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
