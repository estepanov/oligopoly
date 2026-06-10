import { Link } from "react-router-dom";

type LobbyFirstGamePanelProps = {
  loading: boolean;
  username: string | null;
  signInHref: string;
  waitingLobbyCount: number;
  maxWaitingLobbies: number;
};

const firstGameSteps = [
  {
    label: "Create or join",
    detail: "Start a private table, paste an invite, or join a public lobby.",
  },
  {
    label: "Fill seats",
    detail: "Use two humans for a first match, or add AI for solo practice.",
  },
  {
    label: "Ready up",
    detail: "Every human player marks ready before the host can start.",
  },
  {
    label: "Play the first turn",
    detail: "The game screen will coach the next legal action.",
  },
];

export function LobbyFirstGamePanel({
  loading,
  username,
  signInHref,
  waitingLobbyCount,
  maxWaitingLobbies,
}: LobbyFirstGamePanelProps) {
  return (
    <div className="card lobbyFirstGamePanel">
      <div className="lobbyFirstGameIntro">
        <span className="eyebrow">First table</span>
        <h2>Get a game moving</h2>
        <p className="muted">
          Keep setup simple: one friend or one AI opponent, then expand into
          bigger coalition games once the turn loop feels familiar.
        </p>
      </div>

      <ol className="lobbySetupSteps" aria-label="First game setup steps">
        {firstGameSteps.map((step) => (
          <li key={step.label}>
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
          </li>
        ))}
      </ol>

      <div className="lobbySessionSummary">
        <div>
          <span className="eyebrow">Session</span>
          <strong>
            {loading
              ? "Checking session"
              : username
                ? `Signed in as ${username}`
                : "Sign in to create or join"}
          </strong>
        </div>
        <div>
          <span className="eyebrow">Waiting tables</span>
          <strong>
            {waitingLobbyCount}/{maxWaitingLobbies}
          </strong>
        </div>
      </div>

      {!loading && !username && (
        <p className="muted">
          You can browse first. Creating, joining, readying, and starting a game
          require a signed-in session. <Link to={signInHref}>Sign in</Link>.
        </p>
      )}
    </div>
  );
}
