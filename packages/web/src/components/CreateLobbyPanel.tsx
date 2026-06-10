import type { AiPersonality } from "@oligopoly/validation";
import { LobbyAiSettings } from "./LobbyAiSettings";

type CreateLobbyPanelProps = {
  name: string;
  maxPlayers: number;
  isPrivate: boolean;
  aiCount: number;
  aiPersonality: AiPersonality;
  waitingLobbyCount: number;
  maxWaitingLobbies: number;
  signedIn: boolean;
  loading: boolean;
  busy: boolean;
  atLobbyLimit: boolean;
  onNameChange: (value: string) => void;
  onMaxPlayersChange: (value: number) => void;
  onPrivateChange: (value: boolean) => void;
  onAiCountChange: (value: number) => void;
  onAiPersonalityChange: (value: AiPersonality) => void;
  onCreate: () => void;
};

export function CreateLobbyPanel({
  name,
  maxPlayers,
  isPrivate,
  aiCount,
  aiPersonality,
  waitingLobbyCount,
  maxWaitingLobbies,
  signedIn,
  loading,
  busy,
  atLobbyLimit,
  onNameChange,
  onMaxPlayersChange,
  onPrivateChange,
  onAiCountChange,
  onAiPersonalityChange,
  onCreate,
}: CreateLobbyPanelProps) {
  return (
    <div className="card">
      <h2>Create lobby</h2>
      <p className="muted">
        Private is the recommended first-game default. Creating a lobby seats
        your account as host so you can invite a friend or add AI.
      </p>
      {signedIn && (
        <p className="muted">
          Waiting lobby slots used: {waitingLobbyCount}/{maxWaitingLobbies}.
        </p>
      )}
      <div className="formGrid">
        <div>
          <label className="fieldLabel" htmlFor="create-name">
            Name
          </label>
          <input
            id="create-name"
            className="textInput"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </div>
        <div>
          <label className="fieldLabel" htmlFor="create-max">
            Max players
          </label>
          <select
            id="create-max"
            className="textInput"
            value={maxPlayers}
            onChange={(event) => onMaxPlayersChange(Number(event.target.value))}
          >
            {[2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
      </div>
      <LobbyAiSettings
        aiCount={aiCount}
        maxPlayers={maxPlayers}
        personality={aiPersonality}
        onAiCountChange={onAiCountChange}
        onPersonalityChange={onAiPersonalityChange}
      />
      <div className="formGrid">
        <div>
          <label className="fieldLabel" htmlFor="create-visibility">
            Lobby visibility
          </label>
          <select
            id="create-visibility"
            className="textInput"
            value={isPrivate ? "private" : "public"}
            onChange={(event) =>
              onPrivateChange(event.target.value === "private")
            }
          >
            <option value="private">Private - invite link required</option>
            <option value="public">Public - discoverable lobby</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        className="button"
        disabled={busy || loading || !signedIn || atLobbyLimit || !name.trim()}
        onClick={onCreate}
      >
        {busy ? "Creating..." : "Create lobby"}
      </button>
      {signedIn && atLobbyLimit && (
        <p className="muted">
          Leave one of your waiting lobbies before creating another.
        </p>
      )}
    </div>
  );
}
