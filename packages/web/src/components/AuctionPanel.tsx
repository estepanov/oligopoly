import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import { tileLabel } from "../lib/boardDisplay";
import {
  activeEligibleAuctionPlayers,
  canParticipateInAuction,
  hasSubmittedAuction,
  isAuctionBiddingPhase,
  isAuctionPhase,
  isOpenAuctionPhase,
  isSealedAuctionPhase,
  playerById,
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

  const bidding = isAuctionBiddingPhase(state);
  const openAuction = isOpenAuctionPhase(state);
  const sealedAuction = isSealedAuctionPhase(state);

  const currency = state.settings?.currencySymbol ?? "¤";
  const tileName = tileLabel(auction.tilePosition, tileNames);
  const minBid = auction.tieBreakMinBid ?? 1;
  const submitted = hasSubmittedAuction(state, myPlayerId);
  const eligible = canParticipateInAuction(state, myPlayerId);
  const submissionCount = auction.submissionCount ?? 0;
  const eligibleCount = activeEligibleAuctionPlayers(state).length;
  const panelTitle = openAuction
    ? "Open auction"
    : bidding
      ? "Sealed auction"
      : "Auction settling";

  return (
    <div className="auctionPanel">
      <h3>{panelTitle}</h3>
      <p>
        Bidding on <strong>{tileName}</strong>
        {auction.tieBreakRound
          ? ` · tie-break round ${auction.tieBreakRound}`
          : ""}
      </p>
      <p className="muted">
        {bidding ? (
          <>
            Minimum bid: {currency}
            {minBid}. Submissions: {submissionCount}/{eligibleCount}
            {auction.bidDeadlineAt
              ? ` · closes ${new Date(auction.bidDeadlineAt).toLocaleTimeString()}`
              : ""}
          </>
        ) : (
          <>
            Bids are sealed. Revealing results
            {auction.settleDeadlineAt
              ? ` at ${new Date(auction.settleDeadlineAt).toLocaleTimeString()}`
              : " soon"}
            .
          </>
        )}
      </p>

      {openAuction && bidding && (
        <ul className="auctionBidList">
          {Object.entries(auction.submissions).map(([playerId, value]) => {
            const player = playerById(state, playerId);
            const label = player?.displayName ?? playerId;
            const amount =
              value === "pass"
                ? "passed"
                : `${currency}${value.toLocaleString()}`;
            return (
              <li key={playerId}>
                {label}: {amount}
              </li>
            );
          })}
        </ul>
      )}

      {!bidding && sealedAuction && (
        <p className="muted">No further bids can be submitted.</p>
      )}

      {bidding && !eligible && (
        <p className="muted">You are not eligible to bid in this auction.</p>
      )}

      {bidding && eligible && submitted && (
        <p className="ok">
          {openAuction
            ? "Your bid is locked in."
            : "Your sealed bid has been submitted."}
        </p>
      )}

      {bidding && eligible && !submitted && (
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
