import { MAX_TRADE_COUNTERS } from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { playerDisplayName } from "../../lib/gameDisplay";
import { TradeOfferSide } from "./TradeOfferSide";
import type { TradeOffer } from "./types";

export function TradeOfferCard({
  offer,
  state,
  myPlayerId,
  tileNames,
  busy,
  canCounter,
  onAccept,
  onReject,
  onCounter,
}: {
  offer: TradeOffer;
  state: GameState;
  myPlayerId: string;
  tileNames: Map<string, string>;
  busy: boolean;
  canCounter: boolean;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onCounter: () => void;
}) {
  return (
    <article className="tradeOfferCard">
      <div>
        <strong>
          Offer from{" "}
          {playerDisplayName(state, offer.proposerId, { myPlayerId })}
        </strong>
        <p className="muted">
          Expires {new Date(offer.expiresAt).toLocaleTimeString()} · counter{" "}
          {offer.counterCount}/{MAX_TRADE_COUNTERS}
        </p>
      </div>
      <div className="tradeOfferTerms">
        <TradeOfferSide
          label="They give"
          transfer={offer.gives}
          state={state}
          tileNames={tileNames}
        />
        <TradeOfferSide
          label="They request"
          transfer={offer.receives}
          state={state}
          tileNames={tileNames}
        />
      </div>
      <div className="buttonRow">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void onAccept()}
        >
          Accept trade
        </button>
        <button
          type="button"
          className="button buttonSecondary"
          disabled={busy}
          onClick={() => void onReject()}
        >
          Reject
        </button>
        <button
          type="button"
          className="button buttonSecondary"
          disabled={busy || !canCounter}
          onClick={onCounter}
        >
          Counter
        </button>
      </div>
    </article>
  );
}
