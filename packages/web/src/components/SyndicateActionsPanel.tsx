import { buildDefaultSyndicateCharter } from "@oligopoly/shared";
import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import { playerDisplayName } from "../lib/gameDisplay";
import {
  canCallDissolutionVote,
  canFormSyndicate,
  canPayDebt,
  otherHumanPlayers,
  playerById,
} from "../lib/gameUi";

type SyndicateActionsPanelProps = {
  state: GameState;
  myPlayerId: string;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function SyndicateActionsPanel({
  state,
  myPlayerId,
  busy,
  onAction,
}: SyndicateActionsPanelProps) {
  const [syndicateMembers, setSyndicateMembers] = useState<string[]>([]);
  const me = playerById(state, myPlayerId);
  const others = otherHumanPlayers(state, myPlayerId).filter(
    (player) => !player.syndicateId,
  );
  const debt = me?.outstandingDebt ?? 0;
  const showPayDebt = canPayDebt(state, myPlayerId);
  const showFormSyndicate = canFormSyndicate(state, myPlayerId);
  const showDissolutionVote = canCallDissolutionVote(state, myPlayerId);

  if (!showPayDebt && !showFormSyndicate && !showDissolutionVote) {
    return null;
  }

  const toggleMember = (playerId: string) => {
    setSyndicateMembers((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    );
  };

  const formSyndicate = () => {
    const memberIds = [...new Set([myPlayerId, ...syndicateMembers])];
    if (memberIds.length < 2) return;
    void onAction("Formed syndicate", {
      type: "form_syndicate",
      memberIds,
      charter: buildDefaultSyndicateCharter(memberIds),
    });
  };

  return (
    <>
      {showPayDebt && (
        <div className="buttonRow">
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() =>
              void onAction(`Paid debt (${debt})`, {
                type: "pay_debt",
                amount: debt,
              })
            }
          >
            Pay debt ({debt})
          </button>
        </div>
      )}

      {showFormSyndicate && (
        <fieldset className="syndicateForm">
          <legend className="muted">Form syndicate</legend>
          {others.map((player) => (
            <label key={player.playerId} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={syndicateMembers.includes(player.playerId)}
                onChange={() => toggleMember(player.playerId)}
                disabled={busy}
              />{" "}
              {playerDisplayName(state, player.playerId)}
            </label>
          ))}
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy || syndicateMembers.length === 0}
            onClick={formSyndicate}
          >
            Form syndicate (1 AP)
          </button>
        </fieldset>
      )}

      {showDissolutionVote && (
        <div className="buttonRow">
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() =>
              void onAction("Called dissolution vote", {
                type: "call_vote",
                voteType: "dissolve_syndicate",
              })
            }
          >
            Vote to dissolve syndicate
          </button>
        </div>
      )}
    </>
  );
}
