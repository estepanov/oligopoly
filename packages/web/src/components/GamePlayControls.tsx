import type { GameAction, GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
import { playerDisplayName } from "../lib/gameDisplay";
import {
  canBuyPendingTile,
  isAuctionPhase,
  isMyTurn,
  ownedTilesForPlayer,
  phaseUiDescriptor,
  turnGuidance,
} from "../lib/gameUi";
import { ActionPhaseExtras } from "./ActionPhaseExtras";
import { AuctionPanel } from "./AuctionPanel";
import { InsiderPeekPanel } from "./InsiderPeekPanel";
import { OwnedTileEconomicsActions } from "./OwnedTileEconomicsActions";
import { RateCardPanel } from "./RateCardPanel";

type GamePlayControlsProps = {
  state: GameState;
  myPlayerId: string | null;
  tileNames: Map<string, string>;
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

      {myPlayerId && !myTurn && !auctionActive && (
        <p className="muted">Waiting for the current player to act…</p>
      )}

      {myTurn && !auctionActive && guidance && (
        <p className="turnGuidance ok">{guidance}</p>
      )}

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
