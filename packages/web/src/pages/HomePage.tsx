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
          Browse active and completed games backed by the worker API.
        </p>
        <Link to="/games" className="button">
          View games
        </Link>
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
