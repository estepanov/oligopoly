import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import { playerDisplayName } from "../lib/gameDisplay";

type HandshakeRow = NonNullable<GameState["handshakeAgreements"]>[number];

type HandshakePhasePanelProps = {
  state: GameState;
  myPlayerId: string;
  others: Array<{ playerId: string; displayName?: string | null }>;
  handshakes: HandshakeRow[];
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function HandshakePhasePanel({
  state,
  myPlayerId,
  others,
  handshakes,
  busy,
  onAction,
}: HandshakePhasePanelProps) {
  const [handshakeParty, setHandshakeParty] = useState("");
  const [handshakeSummary, setHandshakeSummary] = useState("");

  if (others.length === 0 && handshakes.length === 0) {
    return null;
  }

  return (
    <>
      {others.length > 0 && (
        <div className="handshakeForm">
          <label className="muted">
            Handshake with{" "}
            <select
              value={handshakeParty}
              onChange={(e) => setHandshakeParty(e.target.value)}
              disabled={busy}
            >
              <option value="">Player</option>
              {others.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {playerDisplayName(state, p.playerId)}
                </option>
              ))}
            </select>
          </label>
          <input
            className="textInput"
            value={handshakeSummary}
            onChange={(e) => setHandshakeSummary(e.target.value)}
            placeholder="Agreement summary"
            disabled={busy}
          />
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy || !handshakeParty || !handshakeSummary.trim()}
            onClick={() =>
              void onAction("Proposed handshake", {
                type: "propose_handshake",
                partyB: handshakeParty,
                summary: handshakeSummary.trim(),
              })
            }
          >
            Propose handshake
          </button>
        </div>
      )}

      {handshakes.length > 0 && (
        <ul className="contractList muted">
          {handshakes.map((handshake) => (
            <li key={handshake.id}>
              {handshake.summary} (
              {playerDisplayName(state, handshake.partyA, { myPlayerId })} ↔{" "}
              {playerDisplayName(state, handshake.partyB, { myPlayerId })}) —{" "}
              {handshake.status}
              {handshake.status === "pending" &&
                (handshake.partyA === myPlayerId ||
                  handshake.partyB === myPlayerId) &&
                !handshake.partySignatures?.[myPlayerId] && (
                  <button
                    type="button"
                    className="button buttonSecondary"
                    style={{ marginLeft: "0.5rem" }}
                    disabled={busy}
                    onClick={() =>
                      void onAction("Signed handshake", {
                        type: "sign_handshake",
                        handshakeId: handshake.id,
                      })
                    }
                  >
                    Sign
                  </button>
                )}
              {handshake.status === "active" &&
                (handshake.partyA === myPlayerId ||
                  handshake.partyB === myPlayerId) && (
                  <button
                    type="button"
                    className="button buttonSecondary"
                    style={{ marginLeft: "0.5rem" }}
                    disabled={busy}
                    onClick={() =>
                      void onAction("Broke handshake", {
                        type: "break_handshake",
                        handshakeId: handshake.id,
                      })
                    }
                  >
                    Break
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
