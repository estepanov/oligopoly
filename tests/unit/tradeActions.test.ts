import {
  applyAction,
  expirePendingTradeOffers,
  initTileStates,
  isTileTradeable,
  listTradeableTilePositions,
  normalizeGameState,
  TRADE_OFFER_HISTORY_LIMIT,
  tradeTransferValue,
} from "@oligopoly/shared";
import { TradeErrorKeys } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";

function baseState() {
  return normalizeGameState({
    gameId: "trade-game",
    round: 1,
    phase: "action",
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    freeMarketPool: 0,
    affinityAssignments: {},
    players: [
      {
        playerId: "p1",
        position: 0,
        capital: 1000,
        ownedTilePositions: [3],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
      {
        playerId: "p2",
        position: 0,
        capital: 900,
        ownedTilePositions: [6],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    tiles: initTileStates().map((tile) => {
      if (String(tile.position) === "3") return { ...tile, ownerId: "p1" };
      if (String(tile.position) === "6") return { ...tile, ownerId: "p2" };
      return tile;
    }),
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    settings: { optionalRuleIds: [], turnTimeout: "5min" },
  });
}

describe("trade actions", () => {
  it("proposes and accepts a full money plus property trade", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3] },
      receives: { capital: 50, tilePositions: [6] },
    });

    expect(proposed.state.tradeOffers).toHaveLength(1);
    expect(proposed.state.tradeOffers?.[0].status).toBe("pending");
    expect(
      proposed.state.players.find((player) => player.playerId === "p1")
        ?.actionPointsRemaining,
    ).toBe(1);

    const accepted = applyAction(proposed.state, "p2", {
      type: "accept_trade",
      offerId: "trade-trade-game-1",
    });

    const p1 = accepted.state.players.find(
      (player) => player.playerId === "p1",
    );
    const p2 = accepted.state.players.find(
      (player) => player.playerId === "p2",
    );
    expect(p1?.capital).toBe(950);
    expect(p2?.capital).toBe(950);
    expect(p1?.ownedTilePositions.map(String)).toEqual(["6"]);
    expect(p2?.ownedTilePositions.map(String)).toEqual(["3"]);
    expect(
      accepted.state.tiles.find((tile) => String(tile.position) === "3")
        ?.ownerId,
    ).toBe("p2");
    expect(
      accepted.state.tiles.find((tile) => String(tile.position) === "6")
        ?.ownerId,
    ).toBe("p1");
    expect(accepted.state.tradeOffers?.[0].status).toBe("accepted");
    expect(
      accepted.logEntries.some(
        (entry) => entry.actionType === "trade_accepted",
      ),
    ).toBe(true);
  });

  it("charges one action point for each trade proposal", () => {
    const first = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const second = applyAction(first.state, "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 20, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });

    expect(
      second.state.players.find((player) => player.playerId === "p1")
        ?.actionPointsRemaining,
    ).toBe(0);
    expect(second.state.tradeOffers).toHaveLength(2);
    expect(() =>
      applyAction(second.state, "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 30, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      }),
    ).toThrow("game.insufficient_ap");
  });

  it("allows the recipient to reject an offer out of turn", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });

    const rejected = applyAction(proposed.state, "p2", {
      type: "reject_trade",
      offerId: "trade-trade-game-1",
    });

    expect(rejected.state.tradeOffers?.[0].status).toBe("rejected");
  });

  it("persists the pre-action expiry when a trade response targets a just-expired offer", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const offerId = proposed.state.tradeOffers?.[0].id;
    const expiredPending = {
      ...proposed.state,
      tradeOffers: proposed.state.tradeOffers?.map((offer) =>
        offer.id === offerId ? { ...offer, expiresAt: 1 } : offer,
      ),
    };

    // The pre-action expiry pass flips this offer to `expired`; the response is
    // then a no-op, but the expiry itself (status + `trade_expired` log) must
    // persist rather than being discarded by a thrown `OFFER_NOT_PENDING`.
    for (const responseType of ["accept_trade", "reject_trade"] as const) {
      const result = applyAction(expiredPending, "p2", {
        type: responseType,
        offerId,
      });
      const offer = result.state.tradeOffers?.find(
        (entry) => entry.id === offerId,
      );
      expect(offer?.status).toBe("expired");
      expect(
        result.logEntries.some((entry) => entry.actionType === "trade_expired"),
      ).toBe(true);
      // No assets moved — the trade did not settle.
      expect(
        result.state.players.find((player) => player.playerId === "p1")
          ?.ownedTilePositions,
      ).toEqual([3]);
    }
  });

  it("caps counter offers at two before the offer must resolve", () => {
    const first = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const second = applyAction(first.state, "p2", {
      type: "counter_trade",
      offerId: "trade-trade-game-1",
      gives: { capital: 0, tilePositions: [6] },
      receives: { capital: 20, tilePositions: [] },
    });
    const third = applyAction(second.state, "p1", {
      type: "counter_trade",
      offerId: "trade-trade-game-2",
      gives: { capital: 20, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });

    expect(third.state.tradeOffers?.at(-1)?.counterCount).toBe(2);
    expect(() =>
      applyAction(third.state, "p2", {
        type: "counter_trade",
        offerId: "trade-trade-game-3",
        gives: { capital: 0, tilePositions: [6] },
        receives: { capital: 30, tilePositions: [] },
      }),
    ).toThrow(TradeErrorKeys.COUNTER_LIMIT_REACHED);
  });

  it("expires pending offers without transferring assets", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3] },
      receives: { capital: 50, tilePositions: [6] },
    });
    const deadline = proposed.state.tradeOffers?.[0].expiresAt ?? 0;
    const expired = expirePendingTradeOffers(proposed.state, deadline + 1);

    expect(expired?.state.tradeOffers?.[0].status).toBe("expired");
    expect(expired?.state.players[0].capital).toBe(1000);
    expect(expired?.state.players[0].ownedTilePositions).toEqual([3]);
  });

  it("allows trade responses during insider peek phase", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const peekState = {
      ...proposed.state,
      phase: "waiting_for_insider_peek" as const,
      pendingInsiderPeek: {
        cardId: "card-1",
        trigger: "turn_start" as const,
        playerId: "p1",
      },
    };

    const rejected = applyAction(peekState, "p2", {
      type: "reject_trade",
      offerId: "trade-trade-game-1",
    });

    expect(rejected.state.tradeOffers?.[0].status).toBe("rejected");
  });

  it("allows accepting a trade during insider peek phase", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const peekState = {
      ...proposed.state,
      phase: "waiting_for_insider_peek" as const,
      pendingInsiderPeek: {
        cardId: "card-1",
        trigger: "turn_start" as const,
        playerId: "p1",
      },
    };

    const accepted = applyAction(peekState, "p2", {
      type: "accept_trade",
      offerId: "trade-trade-game-1",
    });

    expect(accepted.state.tradeOffers?.[0].status).toBe("accepted");
    // Special phase is preserved — accepting a trade does not advance it.
    expect(accepted.state.phase).toBe("waiting_for_insider_peek");
  });

  it("allows trade responses during disruption nullify phase", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const nullifyState = {
      ...proposed.state,
      phase: "waiting_for_disruption_nullify" as const,
    };

    const rejected = applyAction(nullifyState, "p2", {
      type: "reject_trade",
      offerId: "trade-trade-game-1",
    });

    expect(rejected.state.tradeOffers?.[0].status).toBe("rejected");
  });

  it("throws invalid_phase when proposing outside the action phase", () => {
    const waitingState = {
      ...baseState(),
      phase: "waiting_for_roll" as const,
    };
    expect(() =>
      applyAction(waitingState, "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 10, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      }),
    ).toThrow("game.invalid_phase");
  });

  it("prunes resolved offers while keeping pending offers", () => {
    let state = baseState();
    for (let index = 0; index < TRADE_OFFER_HISTORY_LIMIT + 3; index += 1) {
      state = {
        ...state,
        players: state.players.map((player) =>
          player.playerId === "p1"
            ? { ...player, actionPointsRemaining: 2 }
            : player,
        ),
      };
      const proposed = applyAction(state, "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 10 + index, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      });
      const pendingOffer = proposed.state.tradeOffers?.find(
        (offer) => offer.status === "pending",
      );
      expect(pendingOffer?.id).toBeDefined();
      const rejected = applyAction(proposed.state, "p2", {
        type: "reject_trade",
        offerId: pendingOffer?.id,
      });
      state = rejected.state;
    }

    const resolvedCount = (state.tradeOffers ?? []).filter(
      (offer) => offer.status !== "pending",
    ).length;
    expect(resolvedCount).toBeLessThanOrEqual(TRADE_OFFER_HISTORY_LIMIT);
  });

  it("values transfers using tile purchase costs", () => {
    const tileCost = tradeTransferValue({
      capital: 0,
      tilePositions: [3],
    });
    expect(tileCost).toBeGreaterThan(0);
    expect(
      tradeTransferValue({
        capital: 50,
        tilePositions: [3],
      }),
    ).toBe(tileCost + 50);
  });

  it("transfers development token maps when trading developed tiles", () => {
    const state = baseState();
    state.players = state.players.map((player) =>
      player.playerId === "p1"
        ? { ...player, developmentTokens: { "3": 2 } }
        : player,
    );
    state.tiles = state.tiles.map((tile) =>
      String(tile.position) === "3" ? { ...tile, developmentTokens: 2 } : tile,
    );

    const proposed = applyAction(state, "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 0, tilePositions: [3] },
      receives: { capital: 0, tilePositions: [] },
    });
    const accepted = applyAction(proposed.state, "p2", {
      type: "accept_trade",
      offerId: "trade-trade-game-1",
    });

    expect(
      accepted.state.players.find((player) => player.playerId === "p1")
        ?.developmentTokens["3"],
    ).toBeUndefined();
    expect(
      accepted.state.players.find((player) => player.playerId === "p2")
        ?.developmentTokens["3"],
    ).toBe(2);
  });

  it("expires pending offers during applyAction before handling the request", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [] },
    });
    const staleOfferState = {
      ...proposed.state,
      tradeOffers: proposed.state.tradeOffers?.map((offer) => ({
        ...offer,
        expiresAt: 1,
      })),
    };

    const ended = applyAction(staleOfferState, "p1", { type: "end_turn" });

    expect(ended.state.tradeOffers?.[0].status).toBe("expired");
    expect(
      ended.logEntries.some((entry) => entry.actionType === "trade_expired"),
    ).toBe(true);
  });

  it("rejects mortgaged or non-owned tiles in offers", () => {
    const mortgaged = baseState();
    mortgaged.tiles = mortgaged.tiles.map((tile) =>
      String(tile.position) === "3" ? { ...tile, mortgaged: true } : tile,
    );

    expect(() =>
      applyAction(mortgaged, "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 0, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [] },
      }),
    ).toThrow(TradeErrorKeys.TILE_MORTGAGED);

    expect(() =>
      applyAction(baseState(), "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 0, tilePositions: [6] },
        receives: { capital: 50, tilePositions: [] },
      }),
    ).toThrow(TradeErrorKeys.TILE_NOT_OWNED);
  });

  // TC-1: accept-time re-validation must reject and leave no partial settlement.
  it("re-validates at accept time and settles nothing when terms went stale", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3] },
      receives: { capital: 50, tilePositions: [6] },
    });

    // Mutate state after the offer: p1's tile becomes mortgaged before accept.
    const staleState = {
      ...proposed.state,
      tiles: proposed.state.tiles.map((tile) =>
        String(tile.position) === "3" ? { ...tile, mortgaged: true } : tile,
      ),
    };

    expect(() =>
      applyAction(staleState, "p2", {
        type: "accept_trade",
        offerId: "trade-trade-game-1",
      }),
    ).toThrow(TradeErrorKeys.TILE_MORTGAGED);

    // No capital or ownership moved on either side.
    const p1 = staleState.players.find((player) => player.playerId === "p1");
    const p2 = staleState.players.find((player) => player.playerId === "p2");
    expect(p1?.capital).toBe(1000);
    expect(p2?.capital).toBe(900);
    expect(p1?.ownedTilePositions.map(String)).toEqual(["3"]);
    expect(p2?.ownedTilePositions.map(String)).toEqual(["6"]);
  });

  it("re-validates at accept time when the promised capital is gone", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 800, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const drainedState = {
      ...proposed.state,
      players: proposed.state.players.map((player) =>
        player.playerId === "p1" ? { ...player, capital: 100 } : player,
      ),
    };

    expect(() =>
      applyAction(drainedState, "p2", {
        type: "accept_trade",
        offerId: "trade-trade-game-1",
      }),
    ).toThrow(TradeErrorKeys.INSUFFICIENT_CAPITAL);
  });

  // TC-2: atomicity + multi-tile.
  it("rolls back fully when the second given tile is invalid", () => {
    const state = baseState();
    state.players = state.players.map((player) =>
      player.playerId === "p1"
        ? { ...player, ownedTilePositions: [3, 8] }
        : player,
    );
    state.tiles = state.tiles.map((tile) => {
      if (String(tile.position) === "3") return { ...tile, ownerId: "p1" };
      if (String(tile.position) === "8") return { ...tile, ownerId: "p1" };
      return tile;
    });

    const proposed = applyAction(state, "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 0, tilePositions: [3, 8] },
      receives: { capital: 100, tilePositions: [] },
    });

    // Invalidate the second tile (8) right before accept.
    const staleState = {
      ...proposed.state,
      tiles: proposed.state.tiles.map((tile) =>
        String(tile.position) === "8" ? { ...tile, mortgaged: true } : tile,
      ),
    };

    expect(() =>
      applyAction(staleState, "p2", {
        type: "accept_trade",
        offerId: "trade-trade-game-1",
      }),
    ).toThrow();

    const p1 = staleState.players.find((player) => player.playerId === "p1");
    const p2 = staleState.players.find((player) => player.playerId === "p2");
    expect(p1?.capital).toBe(1000);
    expect(p2?.capital).toBe(900);
    expect(p1?.ownedTilePositions.map(String)).toEqual(["3", "8"]);
    expect(
      staleState.tiles.find((tile) => String(tile.position) === "3")?.ownerId,
    ).toBe("p1");
  });

  it("conserves capital and tile ownership on a multi-tile both-sides accept", () => {
    const state = baseState();
    state.players = state.players.map((player) => {
      if (player.playerId === "p1") {
        return { ...player, ownedTilePositions: [3, 8] };
      }
      if (player.playerId === "p2") {
        return { ...player, ownedTilePositions: [6, 9] };
      }
      return player;
    });
    state.tiles = state.tiles.map((tile) => {
      if (["3", "8"].includes(String(tile.position))) {
        return { ...tile, ownerId: "p1" };
      }
      if (["6", "9"].includes(String(tile.position))) {
        return { ...tile, ownerId: "p2" };
      }
      return tile;
    });

    const capitalBefore =
      (state.players.find((p) => p.playerId === "p1")?.capital ?? 0) +
      (state.players.find((p) => p.playerId === "p2")?.capital ?? 0);

    const proposed = applyAction(state, "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 100, tilePositions: [3, 8] },
      receives: { capital: 50, tilePositions: [6, 9] },
    });
    const accepted = applyAction(proposed.state, "p2", {
      type: "accept_trade",
      offerId: "trade-trade-game-1",
    });

    const p1 = accepted.state.players.find((p) => p.playerId === "p1");
    const p2 = accepted.state.players.find((p) => p.playerId === "p2");
    expect((p1?.capital ?? 0) + (p2?.capital ?? 0)).toBe(capitalBefore);
    expect(p1?.ownedTilePositions.map(String).sort()).toEqual(["6", "9"]);
    expect(p2?.ownedTilePositions.map(String).sort()).toEqual(["3", "8"]);
    for (const position of ["6", "9"]) {
      expect(
        accepted.state.tiles.find((t) => String(t.position) === position)
          ?.ownerId,
      ).toBe("p1");
    }
    for (const position of ["3", "8"]) {
      expect(
        accepted.state.tiles.find((t) => String(t.position) === position)
          ?.ownerId,
      ).toBe("p2");
    }
  });

  // TC-3: a trade that delivers the final tile crosses the solo win threshold.
  it("ends the game when an accepted trade crosses the solo win threshold", () => {
    const p1Tiles = [1, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19];
    const deliverTile = 21;
    const state = baseState();
    state.players = state.players.map((player) => {
      if (player.playerId === "p1") {
        return { ...player, ownedTilePositions: [...p1Tiles] };
      }
      if (player.playerId === "p2") {
        return { ...player, ownedTilePositions: [deliverTile] };
      }
      return player;
    });
    state.tiles = state.tiles.map((tile) => {
      if (p1Tiles.map(String).includes(String(tile.position))) {
        return { ...tile, ownerId: "p1" };
      }
      if (String(tile.position) === String(deliverTile)) {
        return { ...tile, ownerId: "p2" };
      }
      return tile;
    });

    const proposed = applyAction(state, "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 50, tilePositions: [] },
      receives: { capital: 0, tilePositions: [deliverTile] },
    });
    expect(proposed.state.phase).toBe("action");

    const accepted = applyAction(proposed.state, "p2", {
      type: "accept_trade",
      offerId: "trade-trade-game-1",
    });

    expect(accepted.state.phase).toBe("game_over");
    expect(accepted.state.winnerId).toBe("p1");
    expect(
      accepted.logEntries.some((entry) => entry.actionType === "game_won"),
    ).toBe(true);
  });

  // TC-9 / TC-10: party + terms guards.
  it("rejects a proposal to oneself with INVALID_PARTY", () => {
    expect(() =>
      applyAction(baseState(), "p1", {
        type: "propose_trade",
        recipientId: "p1",
        gives: { capital: 10, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      }),
    ).toThrow(TradeErrorKeys.INVALID_PARTY);
  });

  it("rejects the proposer accepting their own offer with INVALID_PARTY", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    expect(() =>
      applyAction(proposed.state, "p1", {
        type: "accept_trade",
        offerId: "trade-trade-game-1",
      }),
    ).toThrow(TradeErrorKeys.INVALID_PARTY);
  });

  it("rejects a non-participant accepting or rejecting with INVALID_PARTY", () => {
    const state = baseState();
    state.turnOrder = ["p1", "p2", "p3"];
    state.players = [
      ...state.players,
      {
        playerId: "p3",
        position: 0,
        capital: 500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ];

    const proposed = applyAction(state, "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });

    expect(() =>
      applyAction(proposed.state, "p3", {
        type: "accept_trade",
        offerId: "trade-trade-game-1",
      }),
    ).toThrow(TradeErrorKeys.INVALID_PARTY);
    expect(() =>
      applyAction(proposed.state, "p3", {
        type: "reject_trade",
        offerId: "trade-trade-game-1",
      }),
    ).toThrow(TradeErrorKeys.INVALID_PARTY);
  });

  it("rejects an unknown recipient with INVALID_PARTY", () => {
    expect(() =>
      applyAction(baseState(), "p1", {
        type: "propose_trade",
        recipientId: "ghost",
        gives: { capital: 10, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      }),
    ).toThrow(TradeErrorKeys.INVALID_PARTY);
  });

  it("rejects an empty offer on both sides with INVALID_TERMS", () => {
    expect(() =>
      applyAction(baseState(), "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 0, tilePositions: [] },
        receives: { capital: 0, tilePositions: [] },
      }),
    ).toThrow(TradeErrorKeys.INVALID_TERMS);
  });

  it("rejects duplicate tile positions within one side with INVALID_TERMS", () => {
    expect(() =>
      applyAction(baseState(), "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 0, tilePositions: [3, 3] },
        receives: { capital: 50, tilePositions: [] },
      }),
    ).toThrow(TradeErrorKeys.INVALID_TERMS);
  });

  // TC-10(a): countering is a reactive global action and intentionally does NOT
  // cost an action point (unlike propose_trade, which is a turn action). Lock in
  // that intended asymmetry.
  it("does not charge an action point for countering a trade", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const p2ApBefore = proposed.state.players.find(
      (player) => player.playerId === "p2",
    )?.actionPointsRemaining;

    const countered = applyAction(proposed.state, "p2", {
      type: "counter_trade",
      offerId: "trade-trade-game-1",
      gives: { capital: 0, tilePositions: [6] },
      receives: { capital: 20, tilePositions: [] },
    });

    expect(
      countered.state.players.find((player) => player.playerId === "p2")
        ?.actionPointsRemaining,
    ).toBe(p2ApBefore);
  });

  // TC-11: a tile whose sale is blocked by an active contract cannot be traded.
  it("rejects giving a tile blocked by an active sell contract with INVALID_TERMS", () => {
    const state = baseState();
    state.activeContracts = [
      {
        id: "contract-1",
        gameId: "trade-game",
        partyA: "p1",
        partyB: "p2",
        terms: [
          {
            type: "cannot_sell_tile",
            tileId: "3",
            boundPlayerId: "p1",
          },
        ],
        status: "active",
        startsRound: 1,
        expiresRound: null,
        signedAt: 1,
        fulfilledAt: null,
        breachedAt: null,
      },
    ];

    expect(() =>
      applyAction(state, "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 0, tilePositions: [3] },
        receives: { capital: 50, tilePositions: [] },
      }),
    ).toThrow(TradeErrorKeys.INVALID_TERMS);
  });

  // ADV-5: trades to/from eliminated players are blocked.
  it("rejects trades involving an eliminated player with INVALID_PARTY", () => {
    const state = baseState();
    state.eliminatedPlayerIds = ["p2"];
    expect(() =>
      applyAction(state, "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 10, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      }),
    ).toThrow(TradeErrorKeys.INVALID_PARTY);
  });

  // TC-14: offer ids stay unique across a prune boundary.
  it("keeps trade offer ids unique across a prune boundary", () => {
    let state = baseState();
    const allIds = new Set<string>();
    for (let index = 0; index < TRADE_OFFER_HISTORY_LIMIT + 5; index += 1) {
      state = {
        ...state,
        players: state.players.map((player) =>
          player.playerId === "p1"
            ? { ...player, actionPointsRemaining: 2 }
            : player,
        ),
      };
      const proposed = applyAction(state, "p1", {
        type: "propose_trade",
        recipientId: "p2",
        gives: { capital: 10 + index, tilePositions: [] },
        receives: { capital: 0, tilePositions: [6] },
      });
      const pendingOffer = proposed.state.tradeOffers?.find(
        (offer) => offer.status === "pending",
      );
      expect(pendingOffer?.id).toBeDefined();
      // No previously-issued (pruned or live) id may be reused.
      expect(allIds.has(pendingOffer?.id ?? "")).toBe(false);
      allIds.add(pendingOffer?.id ?? "");

      const rejected = applyAction(proposed.state, "p2", {
        type: "reject_trade",
        offerId: pendingOffer?.id,
      });
      state = rejected.state;
    }
    expect(allIds.size).toBe(TRADE_OFFER_HISTORY_LIMIT + 5);
  });
});

describe("tile-tradeability predicate", () => {
  function sellLock(state: ReturnType<typeof baseState>, tileId: string) {
    state.activeContracts = [
      {
        id: "contract-1",
        gameId: "trade-game",
        partyA: "p1",
        partyB: "p2",
        terms: [{ type: "cannot_sell_tile", tileId, boundPlayerId: "p1" }],
        status: "active",
        startsRound: 1,
        expiresRound: null,
        signedAt: 1,
        fulfilledAt: null,
        breachedAt: null,
      },
    ];
  }

  it("isTileTradeable accepts an owned, unmortgaged, unlocked tile", () => {
    expect(isTileTradeable(baseState(), "p1", 3)).toBe(true);
  });

  it("isTileTradeable rejects a tile owned by another player", () => {
    expect(isTileTradeable(baseState(), "p1", 6)).toBe(false);
  });

  it("isTileTradeable rejects a mortgaged tile", () => {
    const state = baseState();
    const tile = state.tiles.find((t) => String(t.position) === "3");
    if (tile) tile.mortgaged = true;
    expect(isTileTradeable(state, "p1", 3)).toBe(false);
  });

  it("isTileTradeable rejects a contract-locked tile", () => {
    const state = baseState();
    sellLock(state, "3");
    expect(isTileTradeable(state, "p1", 3)).toBe(false);
  });

  it("listTradeableTilePositions excludes mortgaged and contract-locked tiles", () => {
    const state = baseState();
    // give p1 a second tradeable tile so we can confirm filtering, not emptiness
    const tile9 = state.tiles.find((t) => String(t.position) === "9");
    if (tile9) tile9.ownerId = "p1";
    const p1 = state.players.find((p) => p.playerId === "p1");
    p1?.ownedTilePositions.push(9);

    // mortgage 3 and lock 9 -> nothing tradeable
    const tile3 = state.tiles.find((t) => String(t.position) === "3");
    if (tile3) tile3.mortgaged = true;
    state.activeContracts = [
      {
        id: "contract-9",
        gameId: "trade-game",
        partyA: "p1",
        partyB: "p2",
        terms: [{ type: "cannot_sell_tile", tileId: "9", boundPlayerId: "p1" }],
        status: "active",
        startsRound: 1,
        expiresRound: null,
        signedAt: 1,
        fulfilledAt: null,
        breachedAt: null,
      },
    ];

    expect(listTradeableTilePositions(state, "p1").map(String)).toEqual([]);

    // unmortgage 3: it becomes the only tradeable position (9 still locked)
    if (tile3) tile3.mortgaged = false;
    expect(listTradeableTilePositions(state, "p1").map(String)).toEqual(["3"]);
  });
});
