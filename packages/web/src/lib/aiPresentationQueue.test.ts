import type { GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import {
  type AiPresentationBeatEvent,
  type AiPresentationBeatInput,
  advancePresentation,
  bufferAiAction,
  createPresentationQueue,
  enqueueAiBeat,
  enqueueCanonical,
  LAG_BUDGET_MS,
  MATERIAL_PAUSE_MS,
  NON_MATERIAL_PAUSE_MS,
  pauseMsFor,
  QUEUE_CAP,
  SOFT_TURN_END_PAUSE_MS,
  skipPresentation,
} from "./aiPresentationQueue";
import { viewerHasUrgentObligation } from "./gameUi";

function state(
  version: number,
  phase: GameState["phase"] = "action",
): GameState {
  return {
    gameId: "g1",
    round: 1,
    phase,
    stateVersion: version,
    currentPlayerIndex: 0,
    turnOrder: ["ai:bot", "human"],
    players: [],
  } as GameState;
}

function beat(
  version: number,
  overrides: Partial<AiPresentationBeatEvent> = {},
): AiPresentationBeatEvent {
  return {
    gameId: "g1",
    stateVersion: version,
    state: state(version),
    aiPlayerId: "ai:bot",
    displayName: "Bot",
    material: true,
    softTurnEnd: false,
    summary: "changed tile ownership",
    sentAt: version * 1000,
    ...overrides,
  };
}

function pendingBeat(
  version: number,
  overrides: Partial<AiPresentationBeatInput> = {},
): AiPresentationBeatInput {
  const { state: _state, ...rest } = beat(version, overrides);
  return rest;
}

describe("aiPresentationQueue", () => {
  it("enters watching on material beat and skip catches up", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueCanonical(q, state(1), false, 0);
    q = enqueueAiBeat(q, beat(2), state(2), false, 10_000);
    expect(q.mode).toBe("watching");
    expect(q.presentationState?.stateVersion).toBe(2);
    q = skipPresentation(q, state(2));
    expect(q.mode).toBe("caught_up");
    expect(q.queue).toHaveLength(0);
  });

  it("auto catch-up when the viewer has an urgent obligation", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(2), true, 10_000);
    expect(q.mode).toBe("caught_up");
  });

  it("keeps AI beats queued when canonical already shows the human's turn but no urgent obligation is owed", () => {
    // Regression for the fast-finishing AI loop case: `runAiTurnLoop` can
    // complete server-side (advancing canonical all the way to "human's
    // turn") before the client has drained the AI beats that led there.
    // Canonical `isMyTurn` alone must not force a catch-up while beats are
    // still queued/current — only an urgent obligation (auction/trade)
    // would.
    let q = createPresentationQueue(state(1));

    q = enqueueCanonical(q, state(2), false, 0);
    q = enqueueAiBeat(q, beat(2), state(2), false, 10_000);
    expect(q.mode).toBe("watching");

    q = enqueueCanonical(q, state(3), false, 0);
    q = enqueueAiBeat(q, beat(3), state(3), false, 10_100);
    expect(q.queue).toHaveLength(1);

    const humanTurnCanonical: GameState = {
      ...state(4, "waiting_for_roll"),
      currentPlayerIndex: 1,
    };
    expect(viewerHasUrgentObligation(humanTurnCanonical, "human")).toBe(false);

    q = enqueueCanonical(q, humanTurnCanonical, false, 0);
    // Must NOT drain: still watching the first beat, second still queued.
    expect(q.mode).toBe("watching");
    expect(q.currentBeat?.stateVersion).toBe(2);
    expect(q.queue).toHaveLength(1);

    q = enqueueAiBeat(q, beat(4), humanTurnCanonical, false, 10_200);
    expect(q.queue).toHaveLength(2);

    q = advancePresentation(q, humanTurnCanonical, 10_000 + MATERIAL_PAUSE_MS);
    expect(q.currentBeat?.stateVersion).toBe(3);
    q = advancePresentation(
      q,
      humanTurnCanonical,
      10_000 + 2 * MATERIAL_PAUSE_MS,
    );
    expect(q.currentBeat?.stateVersion).toBe(4);

    // Presentation catches up to canonical naturally once the queue drains.
    q = advancePresentation(
      q,
      humanTurnCanonical,
      10_000 + 3 * MATERIAL_PAUSE_MS,
    );
    expect(q.mode).toBe("caught_up");
    expect(q.queue).toHaveLength(0);
  });

  it("drops older versions and catches up on a gap", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(2), false, 10_000);
    q = enqueueCanonical(q, state(5), false, 0);
    expect(q.mode).toBe("caught_up");
    expect(q.presentationState?.stateVersion).toBe(5);
  });

  it("uses the configured pause priority", () => {
    expect(pauseMsFor(beat(2))).toBe(MATERIAL_PAUSE_MS);
    expect(pauseMsFor(beat(2, { material: false }))).toBe(
      NON_MATERIAL_PAUSE_MS,
    );
    expect(pauseMsFor(beat(2, { softTurnEnd: true }))).toBe(
      SOFT_TURN_END_PAUSE_MS,
    );
  });

  it("waits for the current pause, promotes queued beats, then catches up", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(3), false, 2_000);
    q = enqueueAiBeat(q, beat(3), state(3), false, 2_001);

    expect(advancePresentation(q, state(3), 3_199)).toBe(q);

    q = advancePresentation(q, state(3), 3_200);
    expect(q.currentBeat?.stateVersion).toBe(3);
    expect(q.presentationState?.stateVersion).toBe(3);
    expect(q.lastAppliedVersion).toBe(3);

    expect(advancePresentation(q, state(3), 4_399)).toBe(q);
    q = advancePresentation(q, state(3), 4_400);
    expect(q.mode).toBe("caught_up");
    expect(q.currentBeat).toBeNull();
  });

  it("ignores beats already applied or pending", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(3), false, 2_000);
    q = enqueueAiBeat(q, beat(3), state(3), false, 2_001);

    expect(enqueueAiBeat(q, beat(2), state(3), false, 2_002)).toBe(q);
    expect(enqueueAiBeat(q, beat(3), state(3), false, 2_002)).toBe(q);
  });

  it("catches up when the queue reaches its cap", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(
      q,
      beat(2, { sentAt: 0 }),
      state(QUEUE_CAP + 2),
      false,
      0,
    );
    for (let version = 3; version <= QUEUE_CAP + 1; version += 1) {
      q = enqueueAiBeat(
        q,
        beat(version, { sentAt: 0 }),
        state(QUEUE_CAP + 2),
        false,
        0,
      );
    }

    q = enqueueAiBeat(
      q,
      beat(QUEUE_CAP + 2, { sentAt: 0 }),
      state(QUEUE_CAP + 2),
      false,
      0,
    );
    expect(q.mode).toBe("caught_up");
    expect(q.queue).toHaveLength(0);
  });

  it("catches up when event-time lag exceeds the budget", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2, { sentAt: 1000 }), state(3), false, 5_000);
    q = enqueueAiBeat(
      q,
      beat(3, { sentAt: 1001 + LAG_BUDGET_MS }),
      state(3),
      false,
      5_001,
    );

    expect(q.mode).toBe("caught_up");
    expect(q.presentationState?.stateVersion).toBe(3);
  });

  it("presents an AI beat when its canonical state arrived first", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueCanonical(q, state(2), false, 0);
    q = enqueueAiBeat(q, beat(2), state(2), false, 10_000);

    expect(q.mode).toBe("watching");
    expect(q.currentBeat?.stateVersion).toBe(2);
    expect(q.presentationState?.stateVersion).toBe(2);
  });

  it("does not re-arm canonical pending after skip and duplicate canonical", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueCanonical(q, state(2), false, 0);
    q = enqueueAiBeat(q, beat(2), state(2), false, 10_000);
    q = skipPresentation(q, state(2));

    expect(q.pendingByVersion.size).toBe(0);
    q = enqueueCanonical(q, state(2), false, 0);
    expect(q.pendingByVersion.size).toBe(0);

    q = enqueueAiBeat(q, beat(2), state(2), false, 20_000);
    expect(q.mode).toBe("caught_up");
    expect(q.currentBeat).toBeNull();
  });

  it("does not rewind presentationState to a stale caught_up canonical", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueCanonical(q, state(3), false, 0);
    expect(q.presentationState?.stateVersion).toBe(3);
    expect(q.lastAppliedVersion).toBe(3);

    q = enqueueCanonical(q, state(2), false, 0);
    expect(q.presentationState?.stateVersion).toBe(3);
    expect(q.lastAppliedVersion).toBe(3);
  });

  it("rejects an AI beat whose gameId does not match canonical", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(
      q,
      beat(2, {
        gameId: "other-game",
        state: { ...state(2), gameId: "other-game" },
      }),
      state(2),
      false,
      10_000,
    );
    expect(q.mode).toBe("caught_up");
    expect(q.currentBeat).toBeNull();
    expect(q.presentationState?.stateVersion).toBe(1);
  });

  it("measures the pause from local presentation time, not sentAt", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2, { sentAt: 1 }), state(2), false, 10_000);

    expect(
      advancePresentation(q, state(2), 10_000 + MATERIAL_PAUSE_MS - 1),
    ).toBe(q);
    q = advancePresentation(q, state(2), 10_000 + MATERIAL_PAUSE_MS);
    expect(q.mode).toBe("caught_up");
  });
});

describe("bufferAiAction / enqueueCanonical flush", () => {
  it("buffers a beat that arrives before its matching canonical state, then flushes on arrival", () => {
    let q = createPresentationQueue(state(1));
    q = bufferAiAction(q, pendingBeat(2));
    expect(q.mode).toBe("caught_up");
    expect(q.pendingByVersion.has(2)).toBe(true);

    q = enqueueCanonical(q, state(2), false, 10_000);

    expect(q.mode).toBe("watching");
    expect(q.currentBeat?.stateVersion).toBe(2);
    expect(q.pendingByVersion.size).toBe(0);
  });

  it("drops stale buffered beats older than the arriving canonical version", () => {
    let q = createPresentationQueue(state(1));
    q = bufferAiAction(q, pendingBeat(2));

    // Canonical jumps straight to 5 without a matching beat ever arriving for
    // 2 — the stale buffered entry must not leak into a later, unrelated
    // pairing at some future version 2 (e.g. after a `gameId` reset).
    q = enqueueCanonical(q, state(5), false, 10_000);

    expect(q.mode).toBe("caught_up");
    expect(q.presentationState?.stateVersion).toBe(5);
    expect(q.pendingByVersion.size).toBe(0);
  });

  it("keeps a buffered beat for a version canonical hasn't reached yet", () => {
    let q = createPresentationQueue(state(1));
    q = bufferAiAction(q, pendingBeat(3));

    q = enqueueCanonical(q, state(2), false, 10_000);

    expect(q.mode).toBe("caught_up");
    expect(q.pendingByVersion.has(3)).toBe(true);
  });

  it("an urgent obligation skips presentation without losing track of a buffered beat's version bookkeeping", () => {
    let q = createPresentationQueue(state(1));
    q = bufferAiAction(q, pendingBeat(2));

    q = enqueueCanonical(q, state(2), true, 10_000);

    expect(q.mode).toBe("caught_up");
    expect(q.lastAppliedVersion).toBe(2);
  });

  it("skip clears a buffered AI beat so a later canonical at that version does not re-enter watching", () => {
    // Regression: `skipPresentation` used to reset only the canonical-side
    // bookkeeping (`canonicalPendingBeatVersion`), leaving a buffered AI beat
    // (`pendingAiByVersion`) behind. A later `enqueueCanonical` at that exact
    // version would then wrongly treat it as a fresh pairing and re-enter
    // "watching" for a beat the viewer already skipped past.
    let q = createPresentationQueue(state(1));
    q = bufferAiAction(q, pendingBeat(2));
    expect(q.pendingByVersion.has(2)).toBe(true);

    q = skipPresentation(q, state(1));
    expect(q.pendingByVersion.size).toBe(0);

    q = enqueueCanonical(q, state(2), false, 10_000);
    expect(q.mode).toBe("caught_up");
    expect(q.currentBeat).toBeNull();
    expect(q.presentationState?.stateVersion).toBe(2);
  });

  it("skip clears a pending canonical half so a later same-version AI beat does not pair", () => {
    // Same regression, other half: a canonical-first pairing (no material AI
    // beat yet) must also be dropped by skip, not just the AI-first case.
    let q = createPresentationQueue(state(1));
    q = enqueueCanonical(q, state(2), false, 0);
    expect(q.pendingByVersion.has(2)).toBe(true);

    q = skipPresentation(q, state(2));
    expect(q.pendingByVersion.size).toBe(0);

    q = enqueueAiBeat(q, beat(2), state(2), false, 20_000);
    expect(q.mode).toBe("caught_up");
    expect(q.currentBeat).toBeNull();
  });
});
