import type { GameAction, GameState } from "@oligopoly/validation";
import { useState } from "react";
import { parseTilePosition, tileLabel } from "../lib/boardDisplay";
import { playerDisplayName } from "../lib/gameDisplay";
import {
  auctionEligibleTilesForPlayer,
  canUseConsumerInsights,
  otherHumanPlayers,
} from "../lib/gameUi";

type AuctionAffinityActionsPanelProps = {
  state: GameState;
  myPlayerId: string;
  tileNames: Map<string, string>;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function AuctionAffinityActionsPanel({
  state,
  myPlayerId,
  tileNames,
  busy,
  onAction,
}: AuctionAffinityActionsPanelProps) {
  const [auctionTile, setAuctionTile] = useState("");
  const [affinityTarget, setAffinityTarget] = useState("");

  const others = otherHumanPlayers(state, myPlayerId);
  const auctionableTiles = auctionEligibleTilesForPlayer(state, myPlayerId);
  const showConsumerInsights = canUseConsumerInsights(state, myPlayerId);

  if (auctionableTiles.length === 0 && !showConsumerInsights) {
    return null;
  }

  return (
    <>
      {auctionableTiles.length > 0 && (
        <div className="playerAuctionForm">
          <label className="muted">
            Auction tile{" "}
            <select
              value={auctionTile}
              onChange={(e) => setAuctionTile(e.target.value)}
              disabled={busy}
            >
              <option value="">Select</option>
              {auctionableTiles.map((tile) => (
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

      {showConsumerInsights && (
        <div className="affinityForm">
          <label className="muted">
            Reveal capital of{" "}
            <select
              value={affinityTarget}
              onChange={(e) => setAffinityTarget(e.target.value)}
              disabled={busy}
            >
              <option value="">Opponent</option>
              {others.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {playerDisplayName(state, player.playerId)}
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
    </>
  );
}
