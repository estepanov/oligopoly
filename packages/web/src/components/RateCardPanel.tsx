import {
  getSyndicateForPlayer,
  type InternalGameState,
  RATE_CARD_STEP,
  SECTOR_IDS,
  type SectorId,
  syndicateQualifiesForRateCard,
} from "@oligopoly/shared";
import type { GameAction, GameState } from "@oligopoly/validation";
import { useMemo, useState } from "react";
import { isMyTurn, isSyndicateAdmin } from "../lib/gameUi";

type RateCardPanelProps = {
  state: GameState;
  myPlayerId: string | null;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function RateCardPanel({
  state,
  myPlayerId,
  busy,
  onAction,
}: RateCardPanelProps) {
  const [multiplier, setMultiplier] = useState(1);

  const canUsePhase =
    state.phase === "action" || state.phase === "rolling_doubles";
  const myTurn = isMyTurn(state, myPlayerId);
  const admin = isSyndicateAdmin(state, myPlayerId);

  const qualifyingSectorIds = useMemo(() => {
    if (!myPlayerId || !admin) return [];
    const syndicate = getSyndicateForPlayer(
      state as unknown as InternalGameState,
      myPlayerId,
    );
    if (!syndicate) return [];
    return SECTOR_IDS.filter((sectorId: SectorId) =>
      syndicateQualifiesForRateCard(
        state as unknown as InternalGameState,
        syndicate.syndicateId,
        sectorId,
      ),
    );
  }, [state, myPlayerId, admin]);

  const [sectorId, setSectorId] = useState<SectorId | null>(null);

  const effectiveSectorId =
    sectorId && qualifyingSectorIds.includes(sectorId)
      ? sectorId
      : (qualifyingSectorIds[0] ?? null);

  if (!canUsePhase || !myTurn || !admin || qualifyingSectorIds.length === 0) {
    return null;
  }

  return (
    <div className="rateCardPanel cardNested">
      <h3>Rate card</h3>
      <p className="muted">
        Set oligopoly pricing for a sector you fully control (including hub).
        Changes apply immediately to the next rent in that sector.
      </p>
      <div className="rateCardForm">
        <label className="muted">
          Sector{" "}
          <select
            value={effectiveSectorId ?? ""}
            onChange={(event) => setSectorId(event.target.value as SectorId)}
            disabled={busy}
          >
            {qualifyingSectorIds.map((id) => (
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
            step={RATE_CARD_STEP}
            value={multiplier}
            onChange={(event) => setMultiplier(Number(event.target.value))}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="button buttonSecondary"
          disabled={busy || !effectiveSectorId}
          onClick={() =>
            void onAction(`Set rate card (${effectiveSectorId})`, {
              type: "set_rate_card",
              sectorId: effectiveSectorId!,
              multiplier,
            })
          }
        >
          Set rate card
        </button>
      </div>
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
