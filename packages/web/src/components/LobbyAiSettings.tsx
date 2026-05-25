import type { AiPersonality } from "@oligopoly/validation";

type LobbyAiSettingsProps = {
  aiCount: number;
  maxPlayers: number;
  personality: AiPersonality;
  onAiCountChange: (count: number) => void;
  onPersonalityChange: (personality: AiPersonality) => void;
};

export function LobbyAiSettings({
  aiCount,
  maxPlayers,
  personality,
  onAiCountChange,
  onPersonalityChange,
}: LobbyAiSettingsProps) {
  return (
    <>
      <div className="formGrid">
        <div>
          <label className="fieldLabel" htmlFor="create-ai-count">
            AI players
          </label>
          <select
            id="create-ai-count"
            className="textInput"
            value={aiCount}
            onChange={(e) => onAiCountChange(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5].map((count) => (
              <option
                key={count}
                value={count}
                disabled={count + 1 > maxPlayers}
              >
                {count}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="fieldLabel" htmlFor="create-ai-personality">
            AI personality
          </label>
          <select
            id="create-ai-personality"
            className="textInput"
            value={personality}
            onChange={(e) =>
              onPersonalityChange(e.target.value as AiPersonality)
            }
          >
            <option value="loyalist">Loyalist</option>
            <option value="opportunist">Opportunist</option>
            <option value="disruptor">Disruptor</option>
          </select>
        </div>
      </div>
      <p className="muted">
        Solo vs AI is one signed-in player plus at least one AI seat.
      </p>
    </>
  );
}
