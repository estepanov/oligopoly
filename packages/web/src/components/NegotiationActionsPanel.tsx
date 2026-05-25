import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import { tileLabel } from "../lib/boardDisplay";
import { otherHumanPlayers, ownedTilesForPlayer } from "../lib/gameUi";

type NegotiationActionsPanelProps = {
  state: GameState;
  myPlayerId: string;
  tileNames: Map<string, string>;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function NegotiationActionsPanel({
  state,
  myPlayerId,
  tileNames,
  busy,
  onAction,
}: NegotiationActionsPanelProps) {
  const [negotiationTarget, setNegotiationTarget] = useState("");
  const [contractPartyB, setContractPartyB] = useState("");
  const [contractTile, setContractTile] = useState("");

  const others = otherHumanPlayers(state, myPlayerId);
  const unmortgaged = ownedTilesForPlayer(state, myPlayerId).filter(
    (tile) => !tile.mortgaged,
  );

  return (
    <>
      {others.length > 0 && (
        <div className="negotiationForm">
          <label className="muted">
            Negotiate with{" "}
            <select
              value={negotiationTarget}
              onChange={(e) => setNegotiationTarget(e.target.value)}
              disabled={busy}
            >
              <option value="">Select player</option>
              {others.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.displayName ?? player.playerId}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy || !negotiationTarget}
            onClick={() =>
              void onAction("Started negotiation", {
                type: "start_negotiation",
                targetPlayerIds: [negotiationTarget],
              })
            }
          >
            Start negotiation
          </button>
        </div>
      )}

      {others.length > 0 && unmortgaged.length > 0 && (
        <div className="contractForm">
          <label className="muted">
            Propose no-sell contract with{" "}
            <select
              value={contractPartyB}
              onChange={(e) => setContractPartyB(e.target.value)}
              disabled={busy}
            >
              <option value="">Player</option>
              {others.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.displayName ?? player.playerId}
                </option>
              ))}
            </select>
          </label>
          <label className="muted">
            Tile{" "}
            <select
              value={contractTile}
              onChange={(e) => setContractTile(e.target.value)}
              disabled={busy}
            >
              <option value="">Your tile</option>
              {unmortgaged.map((tile) => (
                <option
                  key={String(tile.position)}
                  value={String(tile.position)}
                >
                  {tileLabel(tile.position, tileNames)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy || !contractPartyB || !contractTile}
            onClick={() =>
              void onAction("Proposed contract", {
                type: "propose_contract",
                partyB: contractPartyB,
                terms: [
                  {
                    type: "cannot_sell_tile",
                    tileId: contractTile,
                    boundPlayerId: myPlayerId,
                  },
                ],
              })
            }
          >
            Propose binding contract
          </button>
        </div>
      )}

      {state.activeContracts && state.activeContracts.length > 0 && (
        <ul className="contractList muted">
          {state.activeContracts.map((contract) => (
            <li key={contract.id}>
              {contract.id}: {contract.partyA} ↔ {contract.partyB}
              {contract.partySignatures?.[myPlayerId] ? " (you signed)" : ""}
              {!contract.partySignatures?.[myPlayerId] &&
                (contract.partyA === myPlayerId ||
                  contract.partyB === myPlayerId) && (
                  <button
                    type="button"
                    className="button buttonSecondary"
                    style={{ marginLeft: "0.5rem" }}
                    disabled={busy}
                    onClick={() =>
                      void onAction("Signed contract", {
                        type: "sign_contract",
                        contractId: contract.id,
                      })
                    }
                  >
                    Sign
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
