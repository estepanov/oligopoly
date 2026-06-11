import type { GameAction, GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import { describeGameStep, gameActionAvailability } from "../lib/gameStepUi";
import {
  canBuyPendingTile,
  isAuctionPhase,
  isMyTurn,
  ownedTilesForPlayer,
  pendingPurchaseDecision,
} from "../lib/gameUi";
import { ActionPhaseExtras } from "./ActionPhaseExtras";
import { AuctionPanel } from "./AuctionPanel";
import { InsiderPeekPanel } from "./InsiderPeekPanel";
import { OwnedTileEconomicsActions } from "./OwnedTileEconomicsActions";
import { RateCardPanel } from "./RateCardPanel";
import { TradeNegotiationPanel } from "./TradeNegotiationPanel";

type GamePlayControlsProps = {
  state: GameState;
  myPlayerId: string | null;
  tileNames: Map<string, string>;
  busy: boolean;
  pendingAction?: { type: GameAction["type"]; label: string } | null;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

function actionButtonLabel(
  actionType: GameAction["type"],
  idleLabel: string,
  pendingAction: GamePlayControlsProps["pendingAction"],
): string {
  if (pendingAction?.type !== actionType) return idleLabel;

  switch (actionType) {
    case "buy_tile":
      return "Buying...";
    case "decline_tile":
      return "Opening auction...";
    case "draw_market_event":
      return "Drawing...";
    case "end_turn":
      return "Ending...";
    case "path_choice":
      return "Choosing...";
    case "roll_dice":
      return "Rolling...";
    default:
      return "Applying...";
  }
}

export function GamePlayControls({
  state,
  myPlayerId,
  tileNames,
  busy,
  pendingAction,
  onAction,
}: GamePlayControlsProps) {
  const myTurn = isMyTurn(state, myPlayerId);
  const pendingTile = state.pendingBuyTilePosition ?? null;
  const auctionActive = isAuctionPhase(state);
  const ownedTiles = myPlayerId ? ownedTilesForPlayer(state, myPlayerId) : [];
  const gameOver = state.phase === "game_over";
  const insiderPeek = state.pendingInsiderPeek ?? undefined;
  const canBuyTile = canBuyPendingTile(state, myPlayerId);
  const step = describeGameStep(state, myPlayerId);
  const actions = gameActionAvailability(state, myPlayerId);
  const purchaseDecision = myTurn
    ? pendingPurchaseDecision(state, myPlayerId)
    : null;
  const purchaseTileName = purchaseDecision
    ? tileLabel(purchaseDecision.tilePosition, tileNames)
    : null;
  const tradePanel = myPlayerId ? (
    <TradeNegotiationPanel
      state={state}
      myPlayerId={myPlayerId}
      tileNames={tileNames}
      busy={busy}
      onAction={onAction}
    />
  ) : null;

  if (state.phase === "waiting_for_insider_peek") {
    return (
      <>
        {tradePanel}
        <InsiderPeekPanel
          insiderPeek={insiderPeek}
          myPlayerId={myPlayerId}
          busy={busy}
          onAction={onAction}
        />
      </>
    );
  }

  if (gameOver) {
    return (
      <>
        {tradePanel}
        <div className="gameOverBanner">
          <h3>Game over</h3>
          <p>
            Winner: <strong>{playerDisplayName(state, state.winnerId)}</strong>
          </p>
          {state.winSummary?.reason && <p>{state.winSummary.reason}</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="auctionPanel playStepPanel" aria-live="polite">
        <p className="turnGuidance ok">{step.eyebrow}</p>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        <p className="muted">{step.coaching}</p>

        {purchaseDecision && purchaseTileName && (
          <>
            <dl className="purchaseDecisionGrid">
              <div>
                <dt>Tile</dt>
                <dd>
                  <strong>{purchaseTileName}</strong>
                </dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>
                  {purchaseDecision.acquisitionCost === null
                    ? "Unknown"
                    : formatCurrencyAmount(
                        purchaseDecision.acquisitionCost,
                        state.settings,
                      )}
                </dd>
              </div>
              <div>
                <dt>Your cash</dt>
                <dd>
                  {purchaseDecision.playerCapital === null
                    ? "Unknown"
                    : formatCurrencyAmount(
                        purchaseDecision.playerCapital,
                        state.settings,
                      )}
                </dd>
              </div>
              <div>
                <dt>After buying</dt>
                <dd>
                  {purchaseDecision.cashAfterPurchase === null
                    ? "Not enough cash"
                    : formatCurrencyAmount(
                        purchaseDecision.cashAfterPurchase,
                        state.settings,
                      )}
                </dd>
              </div>
            </dl>
            <p className={purchaseDecision.canAfford ? "ok" : "muted"}>
              {purchaseDecision.canAfford
                ? "Buy if this tile advances your sector control or blocks a rival. Decline if you want the table to price it through auction."
                : "You cannot afford the face-value purchase, but declining still opens the auction path."}
            </p>
          </>
        )}
      </div>

      <RateCardPanel
        state={state}
        myPlayerId={myPlayerId}
        busy={busy}
        onAction={onAction}
      />

      <AuctionPanel
        state={state}
        myPlayerId={myPlayerId}
        tileNames={tileNames}
        busy={busy}
        onAction={onAction}
      />

      {tradePanel}

      {myTurn && !auctionActive && (
        <div className="buttonRow">
          {actions.canDrawMarketEvent && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void onAction("Retried market event draw", {
                  type: "draw_market_event",
                })
              }
            >
              {actionButtonLabel(
                "draw_market_event",
                "Retry draw",
                pendingAction,
              )}
            </button>
          )}

          {actions.canRollDice && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void onAction("Rolled dice", { type: "roll_dice" })
              }
            >
              {actionButtonLabel("roll_dice", "Roll dice", pendingAction)}
            </button>
          )}

          {actions.canResolvePurchase && pendingTile !== null && (
            <>
              {canBuyTile && (
                <button
                  type="button"
                  className="button buttonSecondary"
                  disabled={busy}
                  onClick={() =>
                    void onAction("Bought tile", {
                      type: "buy_tile",
                      tilePosition: pendingTile,
                    })
                  }
                >
                  {actionButtonLabel(
                    "buy_tile",
                    `Buy ${purchaseTileName ?? "tile"}`,
                    pendingAction,
                  )}
                </button>
              )}

              <button
                type="button"
                className="button buttonSecondary"
                disabled={busy}
                onClick={() =>
                  void onAction("Declined tile", {
                    type: "decline_tile",
                    tilePosition: pendingTile,
                  })
                }
              >
                {actionButtonLabel(
                  "decline_tile",
                  "Decline - start auction",
                  pendingAction,
                )}
              </button>
            </>
          )}

          {actions.canChoosePath && (
            <>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={busy}
                onClick={() =>
                  void onAction("Chose perimeter path", {
                    type: "path_choice",
                    choice: "perimeter",
                  })
                }
              >
                {actionButtonLabel(
                  "path_choice",
                  "Take perimeter path",
                  pendingAction,
                )}
              </button>

              <button
                type="button"
                className="button buttonSecondary"
                disabled={busy}
                onClick={() =>
                  void onAction("Chose diagonal path", {
                    type: "path_choice",
                    choice: "diagonal",
                  })
                }
              >
                {actionButtonLabel(
                  "path_choice",
                  "Take Diagonal Express",
                  pendingAction,
                )}
              </button>
            </>
          )}

          {actions.canEndTurn && (
            <button
              type="button"
              className="button buttonSecondary"
              disabled={busy}
              onClick={() => void onAction("Ended turn", { type: "end_turn" })}
            >
              {actionButtonLabel("end_turn", "End turn", pendingAction)}
            </button>
          )}
        </div>
      )}

      <ActionPhaseExtras
        state={state}
        myPlayerId={myPlayerId}
        tileNames={tileNames}
        busy={busy}
        onAction={onAction}
      />

      {myTurn &&
        myPlayerId &&
        ownedTiles.length > 0 &&
        state.phase === "action" && (
          <div className="ownedTilesPanel">
            <h3>Your tiles</h3>
            <ul className="ownedTilesList">
              {ownedTiles.map((tile) => {
                const name = tileLabel(tile.position, tileNames);

                return (
                  <li key={String(tile.position)} className="ownedTilesItem">
                    <span>
                      <strong>{name}</strong>
                      {tile.mortgaged ? " (mortgaged)" : ""}
                      {tile.developmentTokens > 0
                        ? ` · ${tile.developmentTokens} token${tile.developmentTokens === 1 ? "" : "s"}`
                        : ""}
                    </span>
                    <OwnedTileEconomicsActions
                      state={state}
                      tile={tile}
                      myPlayerId={myPlayerId}
                      tileName={name}
                      busy={busy}
                      onAction={onAction}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
    </>
  );
}
