import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import { tileLabel } from "../lib/boardDisplay";
import {
  activeEligibleAuctionPlayers,
  canParticipateInAuction,
  hasSubmittedAuction,
  isAuctionPhase,
} from "../lib/gameUi";

type AuctionPanelProps = {
  state: GameState;
  myPlayerId: string | null;
  tileNames: Map<string, string>;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function AuctionPanel({
  state,
  myPlayerId,
  tileNames,
  busy,
  onAction,
}: AuctionPanelProps) {
  const [bidAmount, setBidAmount] = useState("1");
  const auction = state.pendingAuction;

  if (!isAuctionPhase(state) || !auction) {
    return null;
  }

  const currency = state.settings?.currencySymbol ?? "¤";
  const tileName = tileLabel(auction.tilePosition, tileNames);
  const minBid = auction.tieBreakMinBid ?? 1;
  const submitted = hasSubmittedAuction(state, myPlayerId);
  const eligible = canParticipateInAuction(state, myPlayerId);
  const submissionCount = auction.submissionCount ?? 0;
  const eligibleCount = activeEligibleAuctionPlayers(state).length;

  return (
    <div className="auctionPanel">
      <h3>Sealed auction</h3>
      <p>
        Bidding on <strong>{tileName}</strong>
        {auction.tieBreakRound
          ? ` · tie-break round ${auction.tieBreakRound}`
          : ""}
      </p>
      <p className="muted">
        Minimum bid: {currency}
        {minBid}. Submissions: {submissionCount}/{eligibleCount}
      </p>

      {!eligible && (
        <p className="muted">You are not eligible to bid in this auction.</p>
      )}

      {eligible && submitted && (
        <p className="ok">Your sealed bid has been submitted.</p>
      )}

      {eligible && !submitted && (
        <>
          <label className="muted" htmlFor="auction-bid-amount">
            Bid amount
          </label>
          <input
            id="auction-bid-amount"
            type="number"
            min={minBid}
            value={bidAmount}
            onChange={(event) => setBidAmount(event.target.value)}
            style={{ display: "block", width: "100%", maxWidth: "12rem" }}
          />
          <div className="buttonRow" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                const amount = Number.parseInt(bidAmount, 10);
                if (!Number.isFinite(amount)) return;
                void onAction(`Bid ${currency}${amount} on ${tileName}`, {
                  type: "auction_bid",
                  tilePosition: auction.tilePosition,
                  amount,
                });
              }}
            >
              Submit bid
            </button>
            <button
              type="button"
              className="button buttonSecondary"
              disabled={busy}
              onClick={() =>
                void onAction(`Passed on ${tileName}`, {
                  type: "auction_pass",
                  tilePosition: auction.tilePosition,
                })
              }
            >
              Pass
            </button>
          </div>
        </>
      )}
    </div>
  );
}
