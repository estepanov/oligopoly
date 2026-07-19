import type { GameState } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import {
  type AiPresentationBeatEvent,
  advancePresentation,
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

describe("aiPresentationQueue", () => {
  it("enters watching on material beat and skip catches up", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueCanonical(q, state(1), "human", false);
    q = enqueueAiBeat(q, beat(2), state(2), false);
    expect(q.mode).toBe("watching");
    expect(q.presentationState?.stateVersion).toBe(2);
    q = skipPresentation(q, state(2));
    expect(q.mode).toBe("caught_up");
    expect(q.queue).toHaveLength(0);
  });

  it("auto catch-up when viewer needs interaction", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(2), true);
    expect(q.mode).toBe("caught_up");
  });

  it("drops older versions and catches up on a gap", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(2), false);
    q = enqueueCanonical(q, state(5), "human", false);
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
    q = enqueueAiBeat(q, beat(2), state(3), false);
    q = enqueueAiBeat(q, beat(3), state(3), false);

    expect(advancePresentation(q, state(3), 3199)).toBe(q);

    q = advancePresentation(q, state(3), 3200);
    expect(q.currentBeat?.stateVersion).toBe(3);
    expect(q.presentationState?.stateVersion).toBe(3);
    expect(q.lastAppliedVersion).toBe(3);

    q = advancePresentation(q, state(3), 4200);
    expect(q.mode).toBe("caught_up");
    expect(q.currentBeat).toBeNull();
  });

  it("ignores beats already applied or pending", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2), state(3), false);
    q = enqueueAiBeat(q, beat(3), state(3), false);

    expect(enqueueAiBeat(q, beat(2), state(3), false)).toBe(q);
    expect(enqueueAiBeat(q, beat(3), state(3), false)).toBe(q);
  });

  it("catches up when the queue reaches its cap", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2, { sentAt: 0 }), state(QUEUE_CAP + 2), false);
    for (let version = 3; version <= QUEUE_CAP + 1; version += 1) {
      q = enqueueAiBeat(
        q,
        beat(version, { sentAt: 0 }),
        state(QUEUE_CAP + 2),
        false,
      );
    }

    q = enqueueAiBeat(
      q,
      beat(QUEUE_CAP + 2, { sentAt: 0 }),
      state(QUEUE_CAP + 2),
      false,
    );
    expect(q.mode).toBe("caught_up");
    expect(q.queue).toHaveLength(0);
  });

  it("catches up when event-time lag exceeds the budget", () => {
    let q = createPresentationQueue(state(1));
    q = enqueueAiBeat(q, beat(2, { sentAt: 1000 }), state(3), false);
    q = enqueueAiBeat(
      q,
      beat(3, { sentAt: 1001 + LAG_BUDGET_MS }),
      state(3),
      false,
    );

    expect(q.mode).toBe("caught_up");
    expect(q.presentationState?.stateVersion).toBe(3);
  });
});
