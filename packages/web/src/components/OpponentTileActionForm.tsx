import type { GameState } from "@oligopoly/validation";
import { useState } from "react";
import { parseTilePosition, tileLabel } from "../lib/boardDisplay";
import { playerDisplayName } from "../lib/gameDisplay";

type OpponentTileActionFormProps = {
  state: GameState;
  opponents: Array<{ playerId: string; displayName?: string | null }>;
  tileNames: Map<string, string>;
  busy: boolean;
  className?: string;
  targetLabel: string;
  tileLabelText: string;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (
    targetPlayerId: string,
    tilePosition: number | string,
  ) => Promise<void>;
};

export function OpponentTileActionForm({
  state,
  opponents,
  tileNames,
  busy,
  className = "opponentTileForm",
  targetLabel,
  tileLabelText,
  submitLabel,
  disabled = false,
  onSubmit,
}: OpponentTileActionFormProps) {
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [tilePosition, setTilePosition] = useState("");

  const targetTiles =
    (state.players ?? []).find((player) => player.playerId === targetPlayerId)
      ?.ownedTilePositions ?? [];

  return (
    <div className={className}>
      <label className="muted">
        {targetLabel}{" "}
        <select
          value={targetPlayerId}
          onChange={(e) => {
            setTargetPlayerId(e.target.value);
            setTilePosition("");
          }}
          disabled={busy}
        >
          <option value="">Player</option>
          {opponents.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {playerDisplayName(state, p.playerId)}
            </option>
          ))}
        </select>
      </label>
      <label className="muted">
        {tileLabelText}{" "}
        <select
          value={tilePosition}
          onChange={(e) => setTilePosition(e.target.value)}
          disabled={busy || !targetPlayerId}
        >
          <option value="">Tile</option>
          {targetTiles.map((position) => (
            <option key={String(position)} value={String(position)}>
              {tileLabel(position, tileNames)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button buttonSecondary"
        disabled={busy || disabled || !targetPlayerId || !tilePosition}
        onClick={() =>
          void onSubmit(targetPlayerId, parseTilePosition(tilePosition))
        }
      >
        {submitLabel}
      </button>
    </div>
  );
}
