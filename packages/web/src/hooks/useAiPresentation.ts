import type { GameAction, GameState } from "@oligopoly/validation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AiPresentationBeatEvent,
  type AiPresentationQueueState,
  advancePresentation,
  createPresentationQueue,
  enqueueAiBeat,
  enqueueCanonical,
  pauseMsFor,
  skipPresentation,
} from "../lib/aiPresentationQueue";

/** Presentation-relevant fields from a `game.ai_action` WS event, already paired
 * by the caller with the canonical `GameState` at the matching `stateVersion`. */
export type AiPresentationBeatInput = {
  aiPlayerId: string;
  displayName?: string;
  material: boolean;
  softTurnEnd?: boolean;
  summary?: string;
  stateVersion: number;
  action: GameAction;
  sentAt: number;
};

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
  viewerId: string | null,
  urgentObligation: boolean,
) {
  const [queue, setQueue] = useState<AiPresentationQueueState>(() =>
    createPresentationQueue(canonical),
  );
  const canonicalRef = useRef(canonical);
  canonicalRef.current = canonical;

  useEffect(() => {
    if (!canonical) return;
    setQueue((current) =>
      enqueueCanonical(current, canonical, viewerId, urgentObligation),
    );
  }, [canonical, viewerId, urgentObligation]);

  const pushAiAction = useCallback(
    (beatInput: AiPresentationBeatInput, stateForVersion: GameState) => {
      const beat: AiPresentationBeatEvent = {
        stateVersion: beatInput.stateVersion,
        state: stateForVersion,
        aiPlayerId: beatInput.aiPlayerId,
        displayName: beatInput.displayName,
        material: beatInput.material,
        softTurnEnd: beatInput.softTurnEnd ?? false,
        summary: beatInput.summary ?? "",
        sentAt: beatInput.sentAt,
      };
      setQueue((current) =>
        enqueueAiBeat(
          current,
          beat,
          stateForVersion,
          urgentObligation,
          Date.now(),
        ),
      );
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
        const canonicalForAdvance = canonicalRef.current ?? latestCanonical;
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
