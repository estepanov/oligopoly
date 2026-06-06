import type { GameAction, GameState } from "@oligopoly/validation";
import { tileLabel } from "../lib/boardDisplay";
import {
  isAuctionPhase,
  isMyTurn,
  ownedTilesForPlayer,
  phaseUiDescriptor,
  turnGuidance,
} from "../lib/gameUi";
import { ActionPhaseExtras } from "./ActionPhaseExtras";
import { AuctionPanel } from "./AuctionPanel";
import { CoordinationControls } from "./CoordinationControls";
import { InsiderPeekPanel } from "./InsiderPeekPanel";

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
  const turnControlsLocked = busy || auctionActive;
  const ownedTiles = myPlayerId ? ownedTilesForPlayer(state, myPlayerId) : [];
  const currency = state.settings?.currencySymbol ?? "¤";
  const gameOver = state.phase === "game_over";
  const insiderPeek = state.pendingInsiderPeek ?? undefined;
  const guidance = turnGuidance(state, myPlayerId);
  const phaseUi = phaseUiDescriptor(state.phase);

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
    const winner = state.players?.find(
      (player) => player.playerId === state.winnerId,
    );
    return (
      <div className="gameOverBanner">
        <h3>Game over</h3>
        <p>
          Winner:{" "}
          <strong>{winner?.displayName ?? state.winnerId ?? "Unknown"}</strong>
        </p>
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

      <div className="buttonRow">
        <button
          type="button"
          className="button"
          disabled={
            turnControlsLocked || !myTurn || !phaseUi.canDrawMarketEvent
          }
          onClick={() =>
            void onAction("Drew market event", { type: "draw_market_event" })
          }
        >
          Draw market event
        </button>

        <button
          type="button"
          className="button"
          disabled={turnControlsLocked || !myTurn || !phaseUi.canRollDice}
          onClick={() => void onAction("Rolled dice", { type: "roll_dice" })}
        >
          Roll dice
        </button>

        <button
          type="button"
          className="button buttonSecondary"
          disabled={
            turnControlsLocked ||
            !myTurn ||
            !phaseUi.canResolvePurchase ||
            pendingTile === null
          }
          onClick={() =>
            pendingTile !== null &&
            void onAction("Bought tile", {
              type: "buy_tile",
              tilePosition: pendingTile,
            })
          }
        >
          Buy tile
        </button>

        <button
          type="button"
          className="button buttonSecondary"
          disabled={
            turnControlsLocked ||
            !myTurn ||
            !phaseUi.canResolvePurchase ||
            pendingTile === null
          }
          onClick={() =>
            pendingTile !== null &&
            void onAction("Declined tile", {
              type: "decline_tile",
              tilePosition: pendingTile,
            })
          }
        >
          Decline tile
        </button>

        <button
          type="button"
          className="button buttonSecondary"
          disabled={turnControlsLocked || !myTurn || !phaseUi.canChoosePath}
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
          disabled={turnControlsLocked || !myTurn || !phaseUi.canChoosePath}
          onClick={() =>
            void onAction("Chose diagonal path", {
              type: "path_choice",
              choice: "diagonal",
            })
          }
        >
          Diagonal path
        </button>

        <button
          type="button"
          className="button buttonSecondary"
          disabled={turnControlsLocked || !myTurn || !phaseUi.canEndTurn}
          onClick={() => void onAction("Ended turn", { type: "end_turn" })}
        >
          End turn
        </button>
      </div>

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
            {ownedTiles.map((tile) => (
              <li key={String(tile.position)} className="ownedTilesItem">
                <span>
                  <strong>{tileLabel(tile.position, tileNames)}</strong>
                  {tile.mortgaged ? " (mortgaged)" : ""}
                  {tile.developmentTokens > 0
                    ? ` · ${tile.developmentTokens} token${tile.developmentTokens === 1 ? "" : "s"}`
                    : ""}
                </span>
                <div className="buttonRow">
                  {!tile.mortgaged && tile.developmentTokens < 4 && (
                    <button
                      type="button"
                      className="button buttonSecondary"
                      disabled={busy}
                      onClick={() =>
                        void onAction(
                          `Developed ${tileLabel(tile.position, tileNames)}`,
                          {
                            type: "develop_tile",
                            tilePosition: tile.position,
                            tokenNumber: tile.developmentTokens + 1,
                          },
                        )
                      }
                    >
                      Develop ({currency})
                    </button>
                  )}
                  {!tile.mortgaged && (
                    <button
                      type="button"
                      className="button buttonSecondary"
                      disabled={busy}
                      onClick={() =>
                        void onAction(
                          `Mortgaged ${tileLabel(tile.position, tileNames)}`,
                          {
                            type: "mortgage_tile",
                            tilePosition: tile.position,
                          },
                        )
                      }
                    >
                      Mortgage
                    </button>
                  )}
                  {tile.mortgaged && (
                    <button
                      type="button"
                      className="button buttonSecondary"
                      disabled={busy}
                      onClick={() =>
                        void onAction(
                          `Redeemed ${tileLabel(tile.position, tileNames)}`,
                          {
                            type: "redeem_tile",
                            tilePosition: tile.position,
                          },
                        )
                      }
                    >
                      Redeem
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
