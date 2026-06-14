import { ACTION_COSTS, MAX_TRADE_COUNTERS } from "@oligopoly/shared";
import { useMemo, useState } from "react";
import { formatCurrencyAmount, playerDisplayName } from "../../lib/gameDisplay";
import { isMyTurn, otherHumanPlayers, playerById } from "../../lib/gameUi";
import {
  parseCapital,
  selectedTransferValue,
  tradeableTilesForPlayer,
  tradeStatusLabel,
} from "./helpers";
import { TradeOfferDisplayCard } from "./TradeOfferDisplayCard";
import { TradeSideEditor } from "./TradeSideEditor";
import {
  EMPTY_DRAFT,
  type TradeDraft,
  type TradeNegotiationPanelProps,
  type TradeOffer,
} from "./types";

export function TradeNegotiationPanel({
  state,
  myPlayerId,
  tileNames,
  busy,
  onAction,
}: TradeNegotiationPanelProps) {
  const [draft, setDraft] = useState<TradeDraft>(EMPTY_DRAFT);
  // Once the game is over the server has terminated every pending offer, so the
  // desk must not present any response actions for them.
  const gameOver = state.phase === "game_over";
  const myTurn = isMyTurn(state, myPlayerId);
  const myPlayer = playerById(state, myPlayerId);
  const canPropose =
    state.phase === "action" &&
    myTurn &&
    (myPlayer?.actionPointsRemaining ?? 0) >= ACTION_COSTS.PROPOSE_TRADE;
  const canCompose =
    canPropose ||
    (state.phase === "action" && Boolean(draft.counteringOfferId));
  const offers =
    state.tradeOffers?.filter(
      (offer) =>
        offer.proposerId === myPlayerId || offer.recipientId === myPlayerId,
    ) ?? [];
  const pendingIncoming = offers.filter(
    (offer) => offer.status === "pending" && offer.recipientId === myPlayerId,
  );
  const pendingOutgoing = offers.filter(
    (offer) => offer.status === "pending" && offer.proposerId === myPlayerId,
  );
  const visibleHistory = offers.filter((offer) => offer.status !== "pending");
  const target = draft.recipientId
    ? playerById(state, draft.recipientId)
    : undefined;
  const myTiles = useMemo(
    () => tradeableTilesForPlayer(state, myPlayerId, tileNames),
    [state, myPlayerId, tileNames],
  );
  const targetTiles = useMemo(
    () =>
      draft.recipientId
        ? tradeableTilesForPlayer(state, draft.recipientId, tileNames)
        : [],
    [state, draft.recipientId, tileNames],
  );
  const giveCapital = parseCapital(draft.giveCapital);
  const receiveCapital = parseCapital(draft.receiveCapital);
  const giveValue = selectedTransferValue(draft.giveTilePositions, giveCapital);
  const receiveValue = selectedTransferValue(
    draft.receiveTilePositions,
    receiveCapital,
  );
  const hasTerms =
    giveCapital > 0 ||
    receiveCapital > 0 ||
    draft.giveTilePositions.length > 0 ||
    draft.receiveTilePositions.length > 0;
  const canSubmit =
    canCompose &&
    Boolean(target) &&
    hasTerms &&
    giveCapital >= 0 &&
    receiveCapital >= 0;

  if (
    !canCompose &&
    pendingIncoming.length === 0 &&
    pendingOutgoing.length === 0 &&
    visibleHistory.length === 0
  ) {
    return null;
  }

  function updateDraft(patch: Partial<TradeDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function togglePosition(
    field: "giveTilePositions" | "receiveTilePositions",
    position: string,
  ) {
    setDraft((current) => {
      const currentPositions = current[field];
      const nextPositions = currentPositions.includes(position)
        ? currentPositions.filter((entry) => entry !== position)
        : [...currentPositions, position];
      return { ...current, [field]: nextPositions };
    });
  }

  async function submitDraft() {
    if (!canSubmit) return;
    const payload = {
      gives: {
        capital: giveCapital,
        tilePositions: draft.giveTilePositions,
      },
      receives: {
        capital: receiveCapital,
        tilePositions: draft.receiveTilePositions,
      },
    };
    if (draft.counteringOfferId) {
      await onAction("Countered trade", {
        type: "counter_trade",
        offerId: draft.counteringOfferId,
        ...payload,
      });
    } else {
      await onAction("Proposed trade", {
        type: "propose_trade",
        recipientId: draft.recipientId,
        ...payload,
      });
    }
    setDraft(EMPTY_DRAFT);
  }

  function startCounter(offer: TradeOffer) {
    setDraft({
      recipientId: offer.proposerId,
      giveCapital: String(offer.receives.capital),
      receiveCapital: String(offer.gives.capital),
      giveTilePositions: offer.receives.tilePositions.map(String),
      receiveTilePositions: offer.gives.tilePositions.map(String),
      counteringOfferId: offer.id,
    });
  }

  return (
    <section className="tradeDesk" aria-labelledby="trade-negotiation-heading">
      <div className="tradeDeskHeader">
        <div>
          <h3 id="trade-negotiation-heading">Trade desk</h3>
          <p className="muted">
            Money and unmortgaged properties settle immediately when accepted.
          </p>
        </div>
        {pendingIncoming.length > 0 && (
          <span className="tradeDeskBadge">
            {pendingIncoming.length} pending
          </span>
        )}
      </div>

      {canCompose && (
        <div className="tradeTicket" aria-live="polite">
          <label className="tradeField">
            Counterparty
            <select
              name="trade-counterparty"
              value={draft.recipientId}
              disabled={busy || Boolean(draft.counteringOfferId)}
              onChange={(event) =>
                updateDraft({
                  recipientId: event.target.value,
                  receiveTilePositions: [],
                })
              }
            >
              <option value="">Select player</option>
              {otherHumanPlayers(state, myPlayerId).map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {playerDisplayName(state, player.playerId, { myPlayerId })}
                </option>
              ))}
            </select>
          </label>

          <div className="tradeTermsGrid">
            <TradeSideEditor
              legend="You give"
              capitalLabel="Capital you give"
              capitalValue={draft.giveCapital}
              tiles={myTiles}
              selectedPositions={draft.giveTilePositions}
              totalValue={giveValue}
              currencySettings={state.settings}
              disabled={busy}
              onCapitalChange={(value) => updateDraft({ giveCapital: value })}
              onToggleTile={(position) =>
                togglePosition("giveTilePositions", position)
              }
            />
            <TradeSideEditor
              legend="You receive"
              capitalLabel="Capital you request"
              capitalValue={draft.receiveCapital}
              tiles={targetTiles}
              selectedPositions={draft.receiveTilePositions}
              totalValue={receiveValue}
              currencySettings={state.settings}
              disabled={busy || !target}
              emptyText={
                target ? "No tradeable properties" : "Select a counterparty"
              }
              onCapitalChange={(value) =>
                updateDraft({ receiveCapital: value })
              }
              onToggleTile={(position) =>
                togglePosition("receiveTilePositions", position)
              }
            />
          </div>

          <div className="tradeTicketFooter">
            <span className="muted">
              Net value:{" "}
              <strong>
                {formatCurrencyAmount(receiveValue - giveValue, state.settings)}
              </strong>
            </span>
            <div className="buttonRow">
              {draft.counteringOfferId && (
                <button
                  type="button"
                  className="button buttonSecondary"
                  disabled={busy}
                  onClick={() => setDraft(EMPTY_DRAFT)}
                >
                  Cancel counter
                </button>
              )}
              <button
                type="button"
                className="button"
                disabled={busy || !canSubmit}
                onClick={() => void submitDraft()}
              >
                {draft.counteringOfferId ? "Send counter" : "Propose trade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canCompose && pendingIncoming.length > 0 && (
        <p className="muted">
          You can accept or reject anytime. Counter offers are only available
          during your action phase. Counter chains stop after{" "}
          {MAX_TRADE_COUNTERS} replies.
        </p>
      )}

      {pendingIncoming.length > 0 && (
        <div className="tradeOfferStack">
          {pendingIncoming.map((offer) => (
            <TradeOfferDisplayCard
              key={offer.id}
              offer={offer}
              state={state}
              myPlayerId={myPlayerId}
              tileNames={tileNames}
              variant="incoming"
              actions={
                gameOver
                  ? undefined
                  : {
                      busy,
                      canCounter:
                        state.phase === "action" &&
                        offer.counterCount < MAX_TRADE_COUNTERS,
                      onAccept: () =>
                        onAction(
                          `Accepted trade from ${playerDisplayName(state, offer.proposerId, { myPlayerId })}`,
                          { type: "accept_trade", offerId: offer.id },
                        ),
                      onReject: () =>
                        onAction(
                          `Rejected trade from ${playerDisplayName(state, offer.proposerId, { myPlayerId })}`,
                          { type: "reject_trade", offerId: offer.id },
                        ),
                      onCounter: () => startCounter(offer),
                    }
              }
            />
          ))}
        </div>
      )}

      {pendingOutgoing.length > 0 && (
        <section className="tradeOfferStack" aria-label="Sent trade offers">
          {pendingOutgoing.map((offer) => (
            <TradeOfferDisplayCard
              key={offer.id}
              offer={offer}
              state={state}
              myPlayerId={myPlayerId}
              tileNames={tileNames}
              variant="outgoing"
            />
          ))}
        </section>
      )}

      {visibleHistory.length > 0 && (
        <ul className="tradeHistoryList" aria-label="Resolved trade offers">
          {visibleHistory.slice(-4).map((offer) => (
            <li key={offer.id}>
              <strong>{tradeStatusLabel(offer.status)}</strong>{" "}
              {playerDisplayName(state, offer.proposerId, { myPlayerId })} to{" "}
              {playerDisplayName(state, offer.recipientId, { myPlayerId })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
