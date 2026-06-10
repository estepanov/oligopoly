import type { GameAction, GameState } from "@oligopoly/validation";
import { useEffect, useState } from "react";
import { tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import {
  activeEligibleAuctionPlayers,
  canParticipateInAuction,
  currentAuctionHighBid,
  hasSubmittedAuction,
  isAuctionBiddingPhase,
  isAuctionPhase,
  isLiveAuctionPhase,
  isOpenAuctionPhase,
  isSealedAuctionPhase,
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
  const auctionActive = isAuctionPhase(state) && Boolean(auction);
  const bidding = isAuctionBiddingPhase(state);
  const openAuction = isOpenAuctionPhase(state);
  const liveAuction = isLiveAuctionPhase(state);
  const sealedAuction = isSealedAuctionPhase(state);
  const highBid = currentAuctionHighBid(state);
  const minBid =
    auction && liveAuction
      ? Math.max(auction.tieBreakMinBid ?? 1, highBid + 1)
      : (auction?.tieBreakMinBid ?? 1);

  useEffect(() => {
    setBidAmount((current) => {
      const currentBid = Number.parseInt(current, 10);
      return Number.isFinite(currentBid) && currentBid >= minBid
        ? current
        : String(minBid);
    });
  }, [minBid]);

  if (!auctionActive || !auction) {
    return null;
  }

  const visibleBids = openAuction || liveAuction;

  const currencySettings = state.settings;
  const tileName = tileLabel(auction.tilePosition, tileNames);
  const myPlayer = state.players?.find(
    (player) => player.playerId === myPlayerId,
  );
  const playerCapital = myPlayer?.capital ?? null;
  const parsedBid = Number.parseInt(bidAmount, 10);
  const bidIsNumber = Number.isFinite(parsedBid);
  const bidBelowMinimum = bidIsNumber && parsedBid < minBid;
  const bidAboveCash =
    bidIsNumber && playerCapital !== null && parsedBid > playerCapital;
  const cashAfterBid =
    bidIsNumber && playerCapital !== null && !bidAboveCash
      ? playerCapital - parsedBid
      : null;
  const bidError = !bidIsNumber
    ? "Enter a bid amount."
    : bidBelowMinimum
      ? `Minimum bid is ${formatCurrencyAmount(minBid, currencySettings)}.`
      : bidAboveCash
        ? "You do not have enough capital for that bid."
        : null;
  const submitted = hasSubmittedAuction(state, myPlayerId);
  const eligible = canParticipateInAuction(state, myPlayerId);
  const submissionCount = auction.submissionCount ?? 0;
  const eligibleCount = activeEligibleAuctionPlayers(state).length;
  const panelTitle = liveAuction
    ? "Live auction"
    : openAuction
      ? "Open auction"
      : bidding
        ? "Sealed auction"
        : "Auction settling";
  const showBidForm = bidding && eligible && (liveAuction || !submitted);

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
            {liveAuction ? (
              <>
                High bid:{" "}
                {highBid > 0
                  ? formatCurrencyAmount(highBid, currencySettings)
                  : "none"}
                . Next bid ≥ {formatCurrencyAmount(minBid, currencySettings)}
              </>
            ) : (
              <>Minimum bid: {formatCurrencyAmount(minBid, currencySettings)}</>
            )}
            {!liveAuction &&
              `. Submissions: ${submissionCount}/${eligibleCount}`}
            {auction.bidDeadlineAt
              ? ` · ${liveAuction ? "ends" : "closes"} ${new Date(auction.bidDeadlineAt).toLocaleTimeString()}`
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

      {visibleBids && bidding && (
        <ul className="auctionBidList">
          {Object.entries(auction.submissions).map(([playerId, value]) => {
            const label = playerDisplayName(state, playerId, { myPlayerId });
            const amount =
              value === "pass"
                ? "passed"
                : formatCurrencyAmount(value, currencySettings);
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

      {bidding && eligible && submitted && !liveAuction && (
        <p className="ok">
          {openAuction
            ? "Your bid is locked in."
            : "Your sealed bid has been submitted."}
        </p>
      )}

      {showBidForm && (
        <>
          <dl className="purchaseDecisionGrid auctionDecisionGrid">
            <div>
              <dt>Minimum bid</dt>
              <dd>{formatCurrencyAmount(minBid, currencySettings)}</dd>
            </div>
            <div>
              <dt>Your cash</dt>
              <dd>
                {playerCapital === null
                  ? "Unknown"
                  : formatCurrencyAmount(playerCapital, currencySettings)}
              </dd>
            </div>
            <div>
              <dt>After bid</dt>
              <dd>
                {cashAfterBid === null
                  ? "Not available"
                  : formatCurrencyAmount(cashAfterBid, currencySettings)}
              </dd>
            </div>
          </dl>
          <label className="muted" htmlFor="auction-bid-amount">
            Bid amount
          </label>
          <input
            id="auction-bid-amount"
            className="auctionBidInput"
            type="number"
            min={minBid}
            max={playerCapital ?? undefined}
            value={bidAmount}
            onChange={(event) => setBidAmount(event.target.value)}
          />
          {bidError && (
            <p className="errorText" role="alert">
              {bidError}
            </p>
          )}
          <div className="buttonRow auctionActionRow">
            <button
              type="button"
              className="button"
              disabled={busy || Boolean(bidError)}
              onClick={() => {
                if (bidError) return;
                void onAction(
                  `Bid ${formatCurrencyAmount(parsedBid, currencySettings)} on ${tileName}`,
                  {
                    type: "auction_bid",
                    tilePosition: auction.tilePosition,
                    amount: parsedBid,
                  },
                );
              }}
            >
              {liveAuction ? "Place bid" : "Submit bid"}
            </button>
            {!liveAuction && (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
