import type { GameAction, GameState } from "@oligopoly/validation";
import { type BoardTileDetails, tileLabel } from "../lib/boardDisplay";
import { formatCurrencyAmount, playerDisplayName } from "../lib/gameDisplay";
import {
  canBuyPendingTile,
  isAuctionPhase,
  isMyTurn,
  ownedTilesForPlayer,
  phaseUiDescriptor,
  turnGuidance,
} from "../lib/gameUi";
import { getTileEconomics } from "../lib/tileEconomics";
import { ActionPhaseExtras } from "./ActionPhaseExtras";
import { AuctionPanel } from "./AuctionPanel";
import { CoordinationControls } from "./CoordinationControls";
import { InfoDialog } from "./InfoDialog";
import { InsiderPeekPanel } from "./InsiderPeekPanel";

type GamePlayControlsProps = {
  state: GameState;
  myPlayerId: string | null;
  tileNames: Map<string, string>;
  tileDetails: Map<string, BoardTileDetails>;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function GamePlayControls({
  state,
  myPlayerId,
  tileNames,
  busy,
  onAction,
}: GamePlayControlsProps) {
  const myTurn = isMyTurn(state, myPlayerId);
  const pendingTile = state.pendingBuyTilePosition ?? null;
  const auctionActive = isAuctionPhase(state);
  const ownedTiles = myPlayerId ? ownedTilesForPlayer(state, myPlayerId) : [];
  const currencySettings = state.settings;
  const gameOver = state.phase === "game_over";
  const insiderPeek = state.pendingInsiderPeek ?? undefined;
  const guidance = turnGuidance(state, myPlayerId);
  const phaseUi = phaseUiDescriptor(state.phase);
  const canBuyTile = canBuyPendingTile(state, myPlayerId);

  if (state.phase === "waiting_for_insider_peek") {
    return (
      <InsiderPeekPanel
        insiderPeek={insiderPeek}
        myPlayerId={myPlayerId}
        busy={busy}
        onAction={onAction}
      />
    );
  }

  if (gameOver) {
    return (
      <div className="gameOverBanner">
        <h3>Game over</h3>
        <p>
          Winner: <strong>{playerDisplayName(state, state.winnerId)}</strong>
        </p>
        {state.winSummary?.reason && <p>{state.winSummary.reason}</p>}
      </div>
    );
  }

  return (
    <>
      {!myPlayerId && (
        <p className="muted">
          Sign in as a game participant to take actions on your turn.
        </p>
      )}

      {myPlayerId &&
        !myTurn &&
        !auctionActive &&
        state.phase !== "syndicate_coordination" && (
          <p className="muted">Waiting for the current player to act…</p>
        )}

      {myTurn && !auctionActive && guidance && (
        <p className="turnGuidance ok">{guidance}</p>
      )}

      <CoordinationControls
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

      {myTurn && !auctionActive && (
        <div className="buttonRow">
          {phaseUi.canDrawMarketEvent && (
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
              Retry market event draw
            </button>
          )}

          {phaseUi.canRollDice && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void onAction("Rolled dice", { type: "roll_dice" })
              }
            >
              Roll dice
            </button>
          )}

          {phaseUi.canResolvePurchase && pendingTile !== null && (
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
                  Buy tile
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
                Decline tile
              </button>
            </>
          )}

          {phaseUi.canChoosePath && (
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
                Perimeter path
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
                Diagonal path
              </button>
            </>
          )}

          {phaseUi.canEndTurn && (
            <button
              type="button"
              className="button buttonSecondary"
              disabled={busy}
              onClick={() => void onAction("Ended turn", { type: "end_turn" })}
            >
              End turn
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

      {myTurn && ownedTiles.length > 0 && state.phase === "action" && (
        <div className="ownedTilesPanel">
          <h3>Your tiles</h3>
          <ul className="ownedTilesList">
            {ownedTiles.map((tile) => {
              const economics = getTileEconomics(
                state,
                myPlayerId,
                tile.position,
              );
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
                  <div className="buttonRow">
                    {economics.canDevelop &&
                      economics.developmentCost !== null && (
                        <span className="actionWithInfo">
                          <button
                            type="button"
                            className="button buttonSecondary"
                            disabled={busy}
                            onClick={() =>
                              void onAction(`Developed ${name}`, {
                                type: "develop_tile",
                                tilePosition: tile.position,
                                tokenNumber: economics.nextDevelopmentToken,
                              })
                            }
                          >
                            Develop ({economics.formattedDevelopmentCost})
                          </button>
                          <InfoDialog
                            title={`Develop ${name}`}
                            triggerLabel={`Explain developing ${name}`}
                          >
                            <div className="economicsCallout">
                              <span className="economicsLabel">
                                Token {economics.nextDevelopmentToken} cost
                              </span>
                              <strong>
                                {economics.formattedDevelopmentCost}
                              </strong>
                            </div>
                            <dl className="detailsGrid">
                              <dt className="muted">Tile value</dt>
                              <dd>{economics.formattedTileCost}</dd>
                              <dt className="muted">Current development</dt>
                              <dd>
                                {tile.developmentTokens} of{" "}
                                {economics.maxDevelopmentTokens} tokens
                              </dd>
                              <dt className="muted">Action cost</dt>
                              <dd>2 action points</dd>
                              <dt className="muted">Modifier</dt>
                              <dd>
                                {economics.hasLeanDiscount
                                  ? "Lean Manufacturing applied: 20% development discount."
                                  : "No visible development discount applies."}
                              </dd>
                            </dl>
                            <p>
                              This adds the next development token to an active
                              sector tile so future rent uses the higher
                              development rent tier.
                            </p>
                          </InfoDialog>
                        </span>
                      )}
                    {economics.canMortgage &&
                      economics.availableMortgageValue !== null && (
                        <span className="actionWithInfo">
                          <button
                            type="button"
                            className="button buttonSecondary"
                            disabled={busy}
                            onClick={() =>
                              void onAction(`Mortgaged ${name}`, {
                                type: "mortgage_tile",
                                tilePosition: tile.position,
                              })
                            }
                          >
                            Mortgage (+
                            {economics.formattedAvailableMortgageValue})
                          </button>
                          <InfoDialog
                            title={`Mortgage ${name}`}
                            triggerLabel={`Explain mortgaging ${name}`}
                          >
                            <div className="economicsCallout">
                              <span className="economicsLabel">
                                You receive
                              </span>
                              <strong>
                                {economics.formattedAvailableMortgageValue}
                              </strong>
                            </div>
                            <dl className="detailsGrid">
                              <dt className="muted">Tile value</dt>
                              <dd>{economics.formattedTileCost}</dd>
                              <dt className="muted">Mortgage rate</dt>
                              <dd>
                                {Math.round(
                                  economics.availableMortgageRate * 100,
                                )}
                                %
                              </dd>
                              {economics.syntheticCdoActive &&
                                economics.availableMortgageValue !== null &&
                                economics.standardMortgageValue !== null && (
                                  <>
                                    <dt className="muted">
                                      Synthetic CDO bonus
                                    </dt>
                                    <dd>
                                      +
                                      {formatCurrencyAmount(
                                        economics.availableMortgageValue -
                                          economics.standardMortgageValue,
                                        currencySettings,
                                      )}{" "}
                                      this round
                                    </dd>
                                  </>
                                )}
                            </dl>
                            <p>
                              The tile stays yours, but it cannot collect rent,
                              be traded, or receive development until redeemed.
                            </p>
                          </InfoDialog>
                        </span>
                      )}
                    {economics.canRedeem &&
                      economics.redemptionCost !== null && (
                        <span className="actionWithInfo">
                          <button
                            type="button"
                            className="button buttonSecondary"
                            disabled={busy}
                            onClick={() =>
                              void onAction(`Redeemed ${name}`, {
                                type: "redeem_tile",
                                tilePosition: tile.position,
                              })
                            }
                          >
                            Redeem ({economics.formattedRedemptionCost})
                          </button>
                          <InfoDialog
                            title={`Redeem ${name}`}
                            triggerLabel={`Explain redeeming ${name}`}
                          >
                            <div className="economicsCallout">
                              <span className="economicsLabel">You pay</span>
                              <strong>
                                {economics.formattedRedemptionCost}
                              </strong>
                            </div>
                            <dl className="detailsGrid">
                              <dt className="muted">Tile value</dt>
                              <dd>{economics.formattedTileCost}</dd>
                              <dt className="muted">Stored mortgage value</dt>
                              <dd>{economics.formattedStoredMortgageValue}</dd>
                              <dt className="muted">Mortgage rate</dt>
                              <dd>
                                {Math.round(economics.storedMortgageRate * 100)}
                                %
                              </dd>
                              <dt className="muted">Redemption rate</dt>
                              <dd>
                                {Math.round(economics.redemptionRate * 100)}% of
                                stored mortgage value
                              </dd>
                              <dt className="muted">Modifier</dt>
                              <dd>
                                {economics.hasPropTechDiscount
                                  ? "PropTech Pioneer applied: lower redemption rate."
                                  : "No visible redemption discount applies."}
                              </dd>
                            </dl>
                            <p>
                              Redeeming restores rent collection and makes the
                              tile eligible for development again.
                            </p>
                          </InfoDialog>
                        </span>
                      )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
