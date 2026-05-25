import { Link } from "react-router-dom";
import { env } from "../env";

export function HomePage() {
  return (
    <div>
      <h1 className="pageTitle">{env.appName}</h1>
      <p className="tagline">
        A game of markets, alliances, and permanent commitment
      </p>
      <div className="card">
        <h2>Play</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Create, join, and start a lobby before entering a game.
        </p>
        <div className="buttonRow">
          <Link to="/lobbies" className="button">
            Open lobbies
          </Link>
          <Link to="/leaderboard" className="button buttonSecondary">
            Leaderboard
          </Link>
        </div>
        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          You can still browse all games from the Games tab.
        </p>
      </div>
      <div className="card">
        <h2>Developers</h2>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Check worker health and loaded game configuration.
        </p>
        <Link to="/dev">Open developer panel →</Link>
      </div>
    </div>
  );
}
