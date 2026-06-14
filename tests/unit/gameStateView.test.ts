import { describe, expect, it } from "vitest";
import {
  type PersistedGameState,
  redactLogEntriesForViewer,
  scopeGameEventForViewer,
  toClientGameState,
} from "../../packages/worker/src/gameStateView";

function baseState(): PersistedGameState {
  return {
    gameId: "game-1",
    round: 3,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    players: [],
    tiles: [],
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: {},
  } as PersistedGameState;
}

describe("toClientGameState negotiation visibility", () => {
  it("shows open threads to all players", () => {
    const state = baseState();
    state.negotiationThreads = [
      {
        id: "thread-open",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "open",
      },
      {
        id: "thread-private",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "private",
      },
    ];

    const client = toClientGameState(state, "player", "p3");
    expect(client.negotiationThreads?.map((entry) => entry.id)).toEqual([
      "thread-open",
    ]);
  });

  it("still keeps private threads visible to participants", () => {
    const state = baseState();
    state.negotiationThreads = [
      {
        id: "thread-private",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "private",
      },
    ];

    const client = toClientGameState(state, "player", "p2");
    expect(client.negotiationThreads?.map((entry) => entry.id)).toEqual([
      "thread-private",
    ]);
  });

  it("hides private threads from spectators", () => {
    const state = baseState();
    state.negotiationThreads = [
      {
        id: "thread-open",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "open",
      },
      {
        id: "thread-private",
        createdBy: "p1",
        partyIds: ["p1", "p2"],
        status: "open",
        startedRound: 1,
        expiresAfterRound: 4,
        visibility: "private",
      },
    ];

    const client = toClientGameState(state, "spectator", "spectator-1");
    expect(client.negotiationThreads?.map((entry) => entry.id)).toEqual([
      "thread-open",
    ]);
  });
});

describe("toClientGameState handshake visibility", () => {
  it("hides private handshakes from spectators", () => {
    const state = baseState();
    state.handshakeAgreements = [
      {
        id: "handshake-1",
        partyA: "p1",
        partyB: "p2",
        summary: "No trades",
        status: "pending",
        partySignatures: { p1: true },
        createdRound: 3,
      },
    ];

    const client = toClientGameState(state, "spectator", "spectator-1");
    expect(client.handshakeAgreements).toEqual([]);
  });

  it("keeps handshakes visible to participating players", () => {
    const state = baseState();
    state.handshakeAgreements = [
      {
        id: "handshake-1",
        partyA: "p1",
        partyB: "p2",
        summary: "No trades",
        status: "pending",
        partySignatures: { p1: true },
        createdRound: 3,
      },
    ];

    const client = toClientGameState(state, "player", "p2");
    expect(client.handshakeAgreements?.map((entry) => entry.id)).toEqual([
      "handshake-1",
    ]);
  });
});

describe("toClientGameState trade offer visibility", () => {
  it("keeps trade offers visible only to participating players", () => {
    const state = baseState();
    state.tradeOffers = [
      {
        id: "trade-1",
        gameId: "game-1",
        proposerId: "p1",
        recipientId: "p2",
        gives: { capital: 100, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [6] },
        status: "pending",
        createdAt: 1,
        expiresAt: 2,
        counterCount: 0,
      },
    ];

    expect(
      toClientGameState(state, "player", "p2").tradeOffers?.map(
        (offer) => offer.id,
      ),
    ).toEqual(["trade-1"]);
    expect(toClientGameState(state, "player", "p3").tradeOffers).toEqual([]);
    expect(
      toClientGameState(state, "spectator", "spectator").tradeOffers,
    ).toEqual([]);
  });
});

describe("scopeGameEventForViewer", () => {
  const offer = {
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
  };

  function baseEvent() {
    return {
      type: "game.action_applied",
      sentAt: 123,
      gameId: "game-1",
      // tradeOffers travel on a SEPARATE carried field (see
      // prepareGameBroadcastPayload); state itself never carries them.
      state: { ...baseState() },
      tradeOffers: [offer],
    };
  }

  it("re-injects only the viewer's own offers for a participant", () => {
    const scoped = scopeGameEventForViewer(baseEvent(), {
      viewerId: "p2",
      spectator: false,
    });
    const state = scoped.state as PersistedGameState;
    expect(state.tradeOffers?.map((o) => o.id)).toEqual(["trade-1"]);
    // Carried raw offers must never ride on the wire alongside the scoped state.
    expect("tradeOffers" in scoped).toBe(false);
  });

  it("hides foreign trade-offer terms from a non-participant", () => {
    const scoped = scopeGameEventForViewer(baseEvent(), {
      viewerId: "p3",
      spectator: false,
    });
    const state = scoped.state as PersistedGameState;
    expect(state.tradeOffers).toEqual([]);
    // No party ids or terms anywhere in the payload a non-party would receive.
    const wire = JSON.stringify(scoped);
    expect(wire).not.toContain("gives");
    expect(wire).not.toContain("receives");
    expect(wire).not.toContain("proposerId");
  });

  it("hides trade-offer terms from spectators", () => {
    const scoped = scopeGameEventForViewer(baseEvent(), {
      viewerId: "spectator",
      spectator: true,
    });
    const state = scoped.state as PersistedGameState;
    expect(state.tradeOffers).toEqual([]);
    expect(JSON.stringify(scoped)).not.toContain("proposerId");
  });

  it("redacts private trade log entries per viewer", () => {
    const event = {
      ...baseEvent(),
      logEntries: [
        {
          actionType: "trade_proposed",
          payload: { proposerId: "p1", recipientId: "p2", gives: {} },
        },
        { actionType: "buy_tile", payload: { playerId: "p1" } },
      ],
    };
    const participant = scopeGameEventForViewer(event, {
      viewerId: "p1",
      spectator: false,
    });
    const outsider = scopeGameEventForViewer(event, {
      viewerId: "p3",
      spectator: false,
    });
    expect(
      (participant.logEntries as Array<{ actionType: string }>).map(
        (e) => e.actionType,
      ),
    ).toEqual(["trade_proposed", "buy_tile"]);
    expect(
      (outsider.logEntries as Array<{ actionType: string }>).map(
        (e) => e.actionType,
      ),
    ).toEqual(["buy_tile"]);
  });

  it("preserves non-redacted event fields", () => {
    const scoped = scopeGameEventForViewer(baseEvent(), {
      viewerId: "p2",
      spectator: false,
    });
    expect(scoped.type).toBe("game.action_applied");
    expect(scoped.sentAt).toBe(123);
    expect(scoped.gameId).toBe("game-1");
  });
});

describe("redactLogEntriesForViewer (private trade terms)", () => {
  const tradeEntry = {
    actionType: "trade_proposed",
    payload: {
      offerId: "trade-1",
      proposerId: "p1",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3] },
      receives: { capital: 50, tilePositions: [6] },
      status: "pending",
    },
  };
  const publicEntry = {
    actionType: "buy_tile",
    payload: { playerId: "p1", tilePosition: 3 },
  };

  it("delivers private trade entries to the proposer and recipient", () => {
    expect(redactLogEntriesForViewer([tradeEntry, publicEntry], "p1")).toEqual([
      tradeEntry,
      publicEntry,
    ]);
    expect(redactLogEntriesForViewer([tradeEntry, publicEntry], "p2")).toEqual([
      tradeEntry,
      publicEntry,
    ]);
  });

  it("hides private trade terms from non-participants", () => {
    const redacted = redactLogEntriesForViewer([tradeEntry, publicEntry], "p3");
    expect(redacted).toEqual([publicEntry]);
    // The non-participant must not receive gives/receives or party ids at all.
    const leaked = JSON.stringify(redacted);
    expect(leaked).not.toContain("gives");
    expect(leaked).not.toContain("receives");
    expect(leaked).not.toContain("proposerId");
  });

  it("hides private trade terms from spectators (null viewer)", () => {
    expect(redactLogEntriesForViewer([tradeEntry, publicEntry], null)).toEqual([
      publicEntry,
    ]);
  });

  it("redacts every private trade action type", () => {
    const actions = [
      "trade_proposed",
      "trade_accepted",
      "trade_rejected",
      "trade_expired",
      "trade_countered",
    ];
    const entries = actions.map((actionType) => ({
      actionType,
      payload: { proposerId: "p1", recipientId: "p2", gives: {}, receives: {} },
    }));
    expect(redactLogEntriesForViewer(entries, "p3")).toEqual([]);
    expect(redactLogEntriesForViewer(entries, "p1")).toEqual(entries);
  });
});
