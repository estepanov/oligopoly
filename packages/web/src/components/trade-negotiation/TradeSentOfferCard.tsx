import { MAX_TRADE_COUNTERS } from "@oligopoly/shared";
import type { GameState } from "@oligopoly/validation";
import { playerDisplayName } from "../../lib/gameDisplay";
import { TradeOfferSide } from "./TradeOfferSide";
import type { TradeOffer } from "./types";

export function TradeSentOfferCard({
  offer,
  state,
  myPlayerId,
  tileNames,
}: {
  offer: TradeOffer;
  state: GameState;
  myPlayerId: string;
  tileNames: Map<string, string>;
}) {
  return (
    <article className="tradeOfferCard tradeOfferCardReadonly">
      <div>
        <strong>
          Sent to {playerDisplayName(state, offer.recipientId, { myPlayerId })}
        </strong>
        <p className="muted">
          Expires {new Date(offer.expiresAt).toLocaleTimeString()} · counter{" "}
          {offer.counterCount}/{MAX_TRADE_COUNTERS}
        </p>
      </div>
      <div className="tradeOfferTerms">
        <TradeOfferSide
          label="You give"
          transfer={offer.gives}
          state={state}
          tileNames={tileNames}
        />
        <TradeOfferSide
          label="You request"
          transfer={offer.receives}
          state={state}
          tileNames={tileNames}
        />
      </div>
    </article>
  );
}
