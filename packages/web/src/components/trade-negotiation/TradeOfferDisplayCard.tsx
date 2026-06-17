import { MAX_TRADE_COUNTERS } from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { playerDisplayName } from "../../lib/gameDisplay";
import { TradeOfferSide } from "./TradeOfferSide";
import type { TradeOffer } from "./types";

type TradeOfferDisplayVariant = "incoming" | "outgoing";

type TradeOfferDisplayActions = {
  busy: boolean;
  canCounter: boolean;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onCounter: () => void;
};

/**
 * Single trade-offer card shared by the incoming and outgoing offer stacks. The
 * layout (header + expiry/counter metadata + two `TradeOfferSide` blocks) is
 * identical; `variant` only swaps the header label and the "They/You" wording,
 * and `actions` is supplied for incoming offers to render the response row.
 *
 * `actions` is intentionally omitted once the game is over (see
 * `TradeNegotiationPanel`) so Accept/Reject/Counter are never presented for an
 * offer the server has already terminated at `game_over`.
 */
export function TradeOfferDisplayCard({
  offer,
  state,
  myPlayerId,
  tileNames,
  variant,
  actions,
}: {
  offer: TradeOffer;
  state: GameState;
  myPlayerId: string;
  tileNames: Map<string, string>;
  variant: TradeOfferDisplayVariant;
  actions?: TradeOfferDisplayActions;
}) {
  const isIncoming = variant === "incoming";
  const headerName = isIncoming
    ? `Offer from ${playerDisplayName(state, offer.proposerId, { myPlayerId })}`
    : `Sent to ${playerDisplayName(state, offer.recipientId, { myPlayerId })}`;
  const giveLabel = isIncoming ? "They give" : "You give";
  const requestLabel = isIncoming ? "They request" : "You request";

  return (
    <article
      className={
        isIncoming ? "tradeOfferCard" : "tradeOfferCard tradeOfferCardReadonly"
      }
    >
      <div>
        <strong>{headerName}</strong>
        <p className="muted">
          Expires {new Date(offer.expiresAt).toLocaleTimeString()} · counter{" "}
          {offer.counterCount}/{MAX_TRADE_COUNTERS}
        </p>
      </div>
      <div className="tradeOfferTerms">
        <TradeOfferSide
          label={giveLabel}
          transfer={offer.gives}
          state={state}
          tileNames={tileNames}
        />
        <TradeOfferSide
          label={requestLabel}
          transfer={offer.receives}
          state={state}
          tileNames={tileNames}
        />
      </div>
      {actions && (
        <div className="buttonRow">
          <button
            type="button"
            className="button"
            disabled={actions.busy}
            onClick={() => void actions.onAccept()}
          >
            Accept trade
          </button>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={actions.busy}
            onClick={() => void actions.onReject()}
          >
            Reject
          </button>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={actions.busy || !actions.canCounter}
            onClick={actions.onCounter}
          >
            Counter
          </button>
        </div>
      )}
    </article>
  );
}
