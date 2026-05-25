import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import {
  isCoordinationPhase,
  isSyndicateAdmin,
  playerNeedsCoordinationAck,
} from "../lib/gameUi";
import { SECTOR_IDS } from "../lib/sectorIds";

type CoordinationControlsProps = {
  state: GameState;
  myPlayerId: string | null;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function CoordinationControls({
  state,
  myPlayerId,
  busy,
  onAction,
}: CoordinationControlsProps) {
  const [sectorId, setSectorId] = useState<string>(SECTOR_IDS[0]);
  const [multiplier, setMultiplier] = useState(1);

  if (!isCoordinationPhase(state)) return null;

  const needsAck = playerNeedsCoordinationAck(state, myPlayerId);
  const admin = isSyndicateAdmin(state, myPlayerId);

  return (
    <div className="coordinationPanel cardNested">
      <h3>Syndicate coordination</h3>
      <p className="muted">
        Round {state.round}: acknowledge when finished. Syndicate admins may set
        rate cards for qualifying sectors.
      </p>

      {needsAck && myPlayerId && (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() =>
            void onAction("Acknowledged coordination", {
              type: "end_coordination",
            })
          }
        >
          End coordination
        </button>
      )}

      {admin && (
        <div className="rateCardForm">
          <label className="muted">
            Sector{" "}
            <select
              value={sectorId}
              onChange={(event) => setSectorId(event.target.value)}
              disabled={busy}
            >
              {SECTOR_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="muted">
            Multiplier{" "}
            <input
              type="number"
              min={0.5}
              max={2}
              step={0.1}
              value={multiplier}
              onChange={(event) => setMultiplier(Number(event.target.value))}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() =>
              void onAction(`Set rate card (${sectorId})`, {
                type: "set_rate_card",
                sectorId,
                multiplier,
              })
            }
          >
            Set rate card
          </button>
        </div>
      )}

      {state.rateCards && state.rateCards.length > 0 && (
        <ul className="muted" style={{ marginTop: "0.75rem" }}>
          {state.rateCards.map((card) => (
            <li key={`${card.syndicateId}-${card.sectorId}`}>
              {card.sectorId}: ×{card.multiplier} (syndicate {card.syndicateId})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
