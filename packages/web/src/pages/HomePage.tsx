import { Link } from "react-router-dom";
import { env } from "../env";

export function HomePage() {
  return (
    <div className="homePage">
      <section className="homeHero" aria-labelledby="home-heading">
        <div className="homeHeroCopy">
          <span className="eyebrow">Oligopoly Online</span>
          <h1 className="pageTitle" id="home-heading">
            {env.appName}
          </h1>
          <p className="tagline">
            A game of markets, alliances, and permanent commitment.
          </p>
          <div className="buttonRow">
            <Link to="/lobbies" className="button">
              Open lobbies
            </Link>
            <Link to="/leaderboard" className="button buttonSecondary">
              Leaderboard
            </Link>
          </div>
        </div>
        <ul className="homeHeroStats" aria-label="Game shape">
          <li className="statPill">
            <strong>2-6</strong>
            <span>Seats per game</span>
          </li>
          <li className="statPill">
            <strong>AI</strong>
            <span>Solo or mixed lobbies</span>
          </li>
          <li className="statPill">
            <strong>Live</strong>
            <span>Realtime board state</span>
          </li>
        </ul>
      </section>

      <div className="homeActionGrid">
        <div className="card">
          <h2>Start a table</h2>
          <p className="muted">
            Create a public lobby, share a private invite, or add AI seats for a
            quieter solo setup.
          </p>
          <div className="buttonRow">
            <Link to="/lobbies" className="button buttonSecondary">
              Manage lobbies
            </Link>
            <Link to="/games" className="button buttonSecondary">
              Browse games
            </Link>
          </div>
        </div>
        <div className="card">
          <h2>Developer tools</h2>
          <p className="muted">
            Check worker health, inspect loaded board configuration, and run
            local AI debugging from one compact panel.
          </p>
          <Link to="/dev">Open developer panel</Link>
        </div>
      </div>
    </div>
  );
}
