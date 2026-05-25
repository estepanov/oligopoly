import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import { parseTilePosition, tileLabel } from "../lib/boardDisplay";
import {
  isDisruptionNullifyPhase,
  isMyTurn,
  otherHumanPlayers,
  ownedTilesForPlayer,
  playerById,
} from "../lib/gameUi";

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
  const [negotiationTarget, setNegotiationTarget] = useState("");
  const [syndicateMembers, setSyndicateMembers] = useState<string[]>([]);
  const [contractPartyB, setContractPartyB] = useState("");
  const [contractTile, setContractTile] = useState("");
  const [auctionTile, setAuctionTile] = useState<string>("");
  const [affinityTarget, setAffinityTarget] = useState("");
  const [handshakeParty, setHandshakeParty] = useState("");
  const [handshakeSummary, setHandshakeSummary] = useState("");
  const [takeoverTarget, setTakeoverTarget] = useState("");
  const [takeoverTile, setTakeoverTile] = useState("");
  const [manipulationTarget, setManipulationTarget] = useState("");
  const [manipulationTile, setManipulationTile] = useState("");

  const myTurn = isMyTurn(state, myPlayerId);
  const me = myPlayerId ? playerById(state, myPlayerId) : undefined;
  const others = otherHumanPlayers(state, myPlayerId);
  const ownedTiles = myPlayerId ? ownedTilesForPlayer(state, myPlayerId) : [];
  const unmortgaged = ownedTiles.filter((t) => !t.mortgaged);
  const debt = me?.outstandingDebt ?? 0;
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
    const pct = Math.floor(100 / memberIds.length);
    const remainder = 100 - pct * memberIds.length;
    void onAction("Formed syndicate", {
      type: "form_syndicate",
      memberIds,
      charter: {
        governanceModel: "equal_vote",
        deadlockResolution: "public_dice_roll",
        revenueSplit: memberIds.map((id, index) => ({
          playerId: id,
          pct: pct + (index === 0 ? remainder : 0),
        })),
        contributionWeights: {
          assetScorePct: 35,
          revenueScorePct: 35,
          negotiationCreditPct: 30,
        },
        dissolutionClause: {
          trustPenaltyPerMember: -2,
          requiresUnanimousVote: true,
        },
        ratifiedAt: Date.now(),
      },
    });
  };

  return (
    <div className="actionExtras cardNested">
      <h3>Advanced actions</h3>

      {debt > 0 && (
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

      {!me?.syndicateId && others.length > 0 && (
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
              {player.displayName ?? player.playerId}
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
              {others.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName ?? p.playerId}
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
              {others.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName ?? p.playerId}
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
              {unmortgaged.map((t) => (
                <option key={String(t.position)} value={String(t.position)}>
                  {tileLabel(t.position, tileNames)}
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

      {unmortgaged.length > 0 && (
        <div className="playerAuctionForm">
          <label className="muted">
            Auction tile{" "}
            <select
              value={auctionTile}
              onChange={(e) => setAuctionTile(e.target.value)}
              disabled={busy}
            >
              <option value="">Select</option>
              {unmortgaged.map((t) => (
                <option key={String(t.position)} value={String(t.position)}>
                  {tileLabel(t.position, tileNames)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy || !auctionTile}
            onClick={() =>
              void onAction("Initiated auction", {
                type: "initiate_auction",
                tilePosition: parseTilePosition(auctionTile),
              })
            }
          >
            Initiate player auction
          </button>
        </div>
      )}

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
                  {p.displayName ?? p.playerId}
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
              {handshake.summary} ({handshake.partyA} ↔ {handshake.partyB}) —{" "}
              {handshake.status}
              {handshake.status === "pending" &&
                (handshake.partyA === myPlayerId ||
                  handshake.partyB === myPlayerId) &&
                !handshake.partySignatures?.[myPlayerId ?? ""] && (
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

      {me?.syndicateId && (
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

      {optionalRules.includes("hostile_takeover") &&
        others.length > 0 &&
        !me?.hostileTakeoverUsed && (
          <div className="takeoverForm">
            <label className="muted">
              Hostile takeover target{" "}
              <select
                value={takeoverTarget}
                onChange={(e) => setTakeoverTarget(e.target.value)}
                disabled={busy}
              >
                <option value="">Player</option>
                {others.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.displayName ?? p.playerId}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              Their tile{" "}
              <select
                value={takeoverTile}
                onChange={(e) => setTakeoverTile(e.target.value)}
                disabled={busy || !takeoverTarget}
              >
                <option value="">Tile</option>
                {(state.players ?? [])
                  .find((player) => player.playerId === takeoverTarget)
                  ?.ownedTilePositions.map((position) => (
                    <option key={String(position)} value={String(position)}>
                      {tileLabel(position, tileNames)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="button buttonSecondary"
              disabled={busy || !takeoverTarget || !takeoverTile}
              onClick={() =>
                void onAction("Hostile takeover", {
                  type: "hostile_takeover",
                  targetPlayerId: takeoverTarget,
                  tilePosition: parseTilePosition(takeoverTile),
                })
              }
            >
              Hostile takeover (once per game)
            </button>
          </div>
        )}

      {optionalRules.includes("market_manipulation") && others.length > 0 && (
        <div className="manipulationForm">
          <label className="muted">
            Freeze tile owned by{" "}
            <select
              value={manipulationTarget}
              onChange={(e) => setManipulationTarget(e.target.value)}
              disabled={busy}
            >
              <option value="">Player</option>
              {others.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName ?? p.playerId}
                </option>
              ))}
            </select>
          </label>
          <label className="muted">
            Tile{" "}
            <select
              value={manipulationTile}
              onChange={(e) => setManipulationTile(e.target.value)}
              disabled={busy || !manipulationTarget}
            >
              <option value="">Tile</option>
              {(state.players ?? [])
                .find((player) => player.playerId === manipulationTarget)
                ?.ownedTilePositions.map((position) => (
                  <option key={String(position)} value={String(position)}>
                    {tileLabel(position, tileNames)}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy || !manipulationTarget || !manipulationTile}
            onClick={() =>
              void onAction("Market manipulation", {
                type: "market_manipulation",
                targetPlayerId: manipulationTarget,
                tilePosition: parseTilePosition(manipulationTile),
              })
            }
          >
            Freeze tile (¤50)
          </button>
        </div>
      )}

      {affinityId === "consumer_insights" && others.length > 0 && (
        <div className="affinityForm">
          <label className="muted">
            Reveal capital of{" "}
            <select
              value={affinityTarget}
              onChange={(e) => setAffinityTarget(e.target.value)}
              disabled={busy}
            >
              <option value="">Opponent</option>
              {others.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName ?? p.playerId}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy || !affinityTarget}
            onClick={() =>
              void onAction("Used Consumer Insights", {
                type: "use_affinity",
                affinityId: "consumer_insights",
                targetPlayerId: affinityTarget,
              })
            }
          >
            Use affinity
          </button>
        </div>
      )}
    </div>
  );
}
