import type { GameAction, GameState } from "@oligopoly/validation";
import {
  isDisruptionNullifyPhase,
  isMyTurn,
  otherHumanPlayers,
  playerById,
} from "../lib/gameUi";
import { AuctionAffinityActionsPanel } from "./AuctionAffinityActionsPanel";
import { HandshakePhasePanel } from "./HandshakePhasePanel";
import { NegotiationActionsPanel } from "./NegotiationActionsPanel";
import { OpponentTileActionForm } from "./OpponentTileActionForm";
import { SyndicateActionsPanel } from "./SyndicateActionsPanel";

type ActionPhaseExtrasProps = {
  state: GameState;
  myPlayerId: string | null;
  tileNames: Map<string, string>;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function ActionPhaseExtras({
  state,
  myPlayerId,
  tileNames,
  busy,
  onAction,
}: ActionPhaseExtrasProps) {
  const myTurn = isMyTurn(state, myPlayerId);
  const me = myPlayerId ? playerById(state, myPlayerId) : undefined;
  const others = otherHumanPlayers(state, myPlayerId);
  const affinityId = state.myAffinityCardId ?? null;
  const optionalRules = state.settings?.optionalRuleIds ?? [];
  const handshakes = state.handshakeAgreements ?? [];

  if (isDisruptionNullifyPhase(state) && myPlayerId) {
    return (
      <div className="cardNested">
        <h3>Disruption response</h3>
        <p className="muted">
          Accept the card or nullify with Biotech IP (once).
        </p>
        <div className="buttonRow">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() =>
              void onAction("Accepted disruption", {
                type: "accept_disruption",
              })
            }
          >
            Accept disruption
          </button>
          {affinityId === "biotech_ip" && (
            <button
              type="button"
              className="button buttonSecondary"
              disabled={busy}
              onClick={() =>
                void onAction("Nullified disruption", {
                  type: "use_affinity",
                  affinityId: "biotech_ip",
                })
              }
            >
              Nullify (Biotech IP)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!myPlayerId || state.phase !== "action" || !myTurn) {
    return null;
  }

  return (
    <div className="actionExtras cardNested">
      <h3>Advanced actions</h3>
      <SyndicateActionsPanel
        state={state}
        myPlayerId={myPlayerId}
        busy={busy}
        onAction={onAction}
      />
      <NegotiationActionsPanel
        state={state}
        myPlayerId={myPlayerId}
        tileNames={tileNames}
        busy={busy}
        onAction={onAction}
      />

      <HandshakePhasePanel
        state={state}
        myPlayerId={myPlayerId}
        others={others}
        handshakes={handshakes}
        busy={busy}
        onAction={onAction}
      />

      {optionalRules.includes("hostile_takeover") &&
        others.length > 0 &&
        !me?.hostileTakeoverUsed && (
          <OpponentTileActionForm
            className="takeoverForm"
            state={state}
            opponents={others}
            tileNames={tileNames}
            busy={busy}
            targetLabel="Hostile takeover target"
            tileLabelText="Their tile"
            submitLabel="Hostile takeover (once per game)"
            onSubmit={(targetPlayerId, tilePosition) =>
              onAction("Hostile takeover", {
                type: "hostile_takeover",
                targetPlayerId,
                tilePosition,
              })
            }
          />
        )}

      {optionalRules.includes("market_manipulation") && others.length > 0 && (
        <OpponentTileActionForm
          className="manipulationForm"
          state={state}
          opponents={others}
          tileNames={tileNames}
          busy={busy}
          targetLabel="Freeze tile owned by"
          tileLabelText="Tile"
          submitLabel="Freeze tile (¤50)"
          onSubmit={(targetPlayerId, tilePosition) =>
            onAction("Market manipulation", {
              type: "market_manipulation",
              targetPlayerId,
              tilePosition,
            })
          }
        />
      )}
      <AuctionAffinityActionsPanel
        state={state}
        myPlayerId={myPlayerId}
        tileNames={tileNames}
        busy={busy}
        onAction={onAction}
      />
    </div>
  );
}
