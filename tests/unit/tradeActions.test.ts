import {
  applyAction,
  expirePendingTradeOffers,
  initTileStates,
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

  it("blocks trade responses after applyAction reconciles expired offers", () => {
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

    expect(() =>
      applyAction(expiredPending, "p2", {
        type: "reject_trade",
        offerId,
      }),
    ).toThrow(TradeErrorKeys.OFFER_NOT_PENDING);
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
});
