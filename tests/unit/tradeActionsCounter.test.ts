import { applyAction } from "@oligopoly/shared";
import { TradeErrorKeys } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import { baseState } from "../helpers/tradeActionsFixture";

describe("trade actions - counter and counter cap", () => {
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

  it("allows the recipient to counter a trade in a non-action phase", () => {
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

    // Countering is a recipient RESPONSE (like accept/reject): valid off-turn in
    // any phase, registered globally, and does not require the action phase.
    const countered = applyAction(peekState, "p2", {
      type: "counter_trade",
      offerId: "trade-trade-game-1",
      gives: { capital: 0, tilePositions: [6] },
      receives: { capital: 20, tilePositions: [] },
    });

    expect(countered.state.tradeOffers?.[0].status).toBe("countered");
    const counterOffer = countered.state.tradeOffers?.find(
      (offer) => offer.status === "pending",
    );
    expect(counterOffer?.proposerId).toBe("p2");
    expect(counterOffer?.recipientId).toBe("p1");
    expect(counterOffer?.counterCount).toBe(1);
    // The special phase is preserved — countering does not advance it.
    expect(countered.state.phase).toBe("waiting_for_insider_peek");
    expect(
      countered.logEntries.some(
        (entry) => entry.actionType === "trade_countered",
      ),
    ).toBe(true);
  });

  it("does not charge an action point when countering off-turn", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const p2Before = proposed.state.players.find(
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
    ).toBe(p2Before);
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
});

describe("trade actions - responses in special phases", () => {
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
});
