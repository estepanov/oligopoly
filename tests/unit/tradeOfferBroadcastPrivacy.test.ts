import { describe, expect, it } from "vitest";
import { scopeGameEventForViewer } from "../../packages/worker/src/gameStateView";
import {
  buildGameScheduleEvent,
  notifyGameSchedule,
} from "../../packages/worker/src/services/gameAi";
import { notifyGameActionResult } from "../../packages/worker/src/services/gamePersistence";

/**
 * Privacy contract enforced across EVERY realtime emit path: a non-participant
 * must never receive another player's `tradeOffers` terms (gives/receives/party
 * ids), while a participant must. This makes the strip → carry → re-inject →
 * filter contract executable rather than comment-only. Each path produces the
 * over-the-wire event; we then run that event through `scopeGameEventForViewer`
 * (the single per-viewer scoping used by the DO fan-out) for a non-party and a
 * party and assert the contract.
 */

const offers = [
  {
    id: "trade-1",
    gameId: "game-1",
    proposerId: "p1",
    recipientId: "p2",
    gives: { capital: 100, tilePositions: [3] },
    receives: { capital: 50, tilePositions: [6] },
    status: "pending",
    createdAt: 1,
    expiresAt: Date.now() + 300_000,
    counterCount: 0,
  },
];

function stateWithOffers() {
  return {
    gameId: "game-1",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
    players: [],
    tiles: [],
    tradeOffers: offers,
  };
}

/** Records the over-the-wire event POSTed to the Durable Object. */
function captureBroadcastRoom() {
  const events: Record<string, unknown>[] = [];
  const room = {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (request: Request) => {
        events.push(
          JSON.parse(await request.text()) as Record<string, unknown>,
        );
        return new Response("ok");
      },
    }),
  } as unknown as DurableObjectNamespace;
  return { room, events };
}

type ScopableEvent = {
  state: Record<string, unknown>;
  tradeOffers?: unknown;
  logEntries?: Array<{
    actionType: string;
    payload: Record<string, unknown> | null;
  }>;
  [key: string]: unknown;
};

function assertPrivacyContract(event: ScopableEvent) {
  // The wire event itself must NOT carry the offer terms on `state`.
  expect("tradeOffers" in event.state).toBe(false);

  // Non-participant: no offers, no leaked terms anywhere in their scoped payload.
  const outsider = scopeGameEventForViewer(event, {
    viewerId: "p3",
    spectator: false,
  });
  const outsiderState = outsider.state as { tradeOffers?: unknown[] };
  expect(outsiderState.tradeOffers ?? []).toEqual([]);
  const outsiderWire = JSON.stringify(outsider);
  expect(outsiderWire).not.toContain("gives");
  expect(outsiderWire).not.toContain("receives");
  expect(outsiderWire).not.toContain("proposerId");

  // Spectator: same guarantee.
  const spectator = scopeGameEventForViewer(event, {
    viewerId: "spectator",
    spectator: true,
  });
  expect(JSON.stringify(spectator)).not.toContain("proposerId");

  // Participant: receives their own offer terms.
  const party = scopeGameEventForViewer(event, {
    viewerId: "p2",
    spectator: false,
  });
  const partyState = party.state as {
    tradeOffers?: Array<{ id: string }>;
  };
  expect(partyState.tradeOffers?.map((o) => o.id)).toEqual(["trade-1"]);
}

describe("trade-offer broadcast privacy across emit paths", () => {
  it("notifyGameActionResult keeps foreign offer terms off non-party viewers", async () => {
    const { room, events } = captureBroadcastRoom();
    await notifyGameActionResult(
      "game-1",
      {
        state: stateWithOffers() as never,
        logEntries: [
          {
            playerId: "p1",
            actionType: "trade_proposed",
            payload: { offerId: "trade-1" },
          },
        ],
      },
      [],
      { gameRoom: room },
    );
    expect(events).toHaveLength(1);
    assertPrivacyContract(events[0] as ScopableEvent);
  });

  it("notifyGameSchedule keeps foreign offer terms off non-party viewers", async () => {
    const { room, events } = captureBroadcastRoom();
    await notifyGameSchedule(room, "game-1", stateWithOffers());
    expect(events).toHaveLength(1);
    assertPrivacyContract(events[0] as ScopableEvent);
  });

  it("buildGameScheduleEvent (DO AI-loop emit) keeps foreign terms off non-party viewers", () => {
    // The in-DO AI-loop fan-out broadcasts exactly this event object.
    const event = buildGameScheduleEvent("game-1", stateWithOffers());
    assertPrivacyContract(event as ScopableEvent);
  });
});
