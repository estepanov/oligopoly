import { applyAction, expirePendingTradeOffers } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";
import { baseState } from "../helpers/tradeActionsFixture";

describe("trade actions - expiry and race reconciliation", () => {
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

  it("expires pending offers deterministically via an injected clock", () => {
    const proposed = applyAction(baseState(), "p1", {
      type: "propose_trade",
      recipientId: "p2",
      gives: { capital: 10, tilePositions: [] },
      receives: { capital: 0, tilePositions: [6] },
    });
    const offer = proposed.state.tradeOffers?.[0];
    const offerId = offer?.id;
    const expiresAt = offer?.expiresAt ?? 0;

    // Drive a later action with an injected `nowMs` past the offer's deadline:
    // the pre-action expiry reconciliation must flip it to `expired` without any
    // reliance on wall-clock time.
    const afterExpiry = applyAction(
      proposed.state,
      "p1",
      { type: "end_turn" },
      expiresAt + 1,
    );
    expect(
      afterExpiry.state.tradeOffers?.find((entry) => entry.id === offerId)
        ?.status,
    ).toBe("expired");

    // The same action just before the deadline leaves the offer pending.
    const beforeExpiry = applyAction(
      proposed.state,
      "p1",
      { type: "end_turn" },
      expiresAt - 1,
    );
    expect(
      beforeExpiry.state.tradeOffers?.find((entry) => entry.id === offerId)
        ?.status,
    ).toBe("pending");
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
});
