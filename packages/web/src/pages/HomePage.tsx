import { Link } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { FirstGameGuide } from "../components/FirstGameGuide";
import { env } from "../env";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="homePage">
      <section className="homeHero" aria-labelledby="home-heading">
        <div className="homeHeroCopy">
          <span className="eyebrow">Oligopoly Online</span>
          <h1 className="pageTitle" id="home-heading">
            {env.appName}
          </h1>
          <p className="tagline">
            Create a private table, invite a friend or add AI, and learn each
            turn with clear next-step prompts.
          </p>
          <div className="buttonRow">
            <a href="#first-game-guide-heading" className="button">
              Start your first game
            </a>
            <Link
              to={user ? "/lobbies" : "/login"}
              className="button buttonSecondary"
            >
              {user ? "Open lobbies" : "Sign in"}
            </Link>
          </div>
        </div>
        <div className="homeHeroVisual">
          <div className="homeBoardPreview" aria-hidden="true">
            <div className="homeBoardRail homeBoardRailTop" />
            <div className="homeBoardRail homeBoardRailRight" />
            <div className="homeBoardRail homeBoardRailBottom" />
            <div className="homeBoardRail homeBoardRailLeft" />
            <div className="homeBoardToken homeBoardTokenA" />
            <div className="homeBoardToken homeBoardTokenB" />
            <div className="homeBoardRoute" />
            <div className="homeBoardDeal">
              <span>Ready</span>
              <strong>Start table</strong>
            </div>
          </div>
          <ul className="homeHeroStats" aria-label="Game shape">
            <li className="statPill">
              <strong>2-6</strong>
              <span>Seats per game</span>
            </li>
            <li className="statPill">
              <strong>Invite</strong>
              <span>Private lobbies</span>
            </li>
            <li className="statPill">
              <strong>AI</strong>
              <span>Solo practice</span>
            </li>
          </ul>
        </div>
      </section>

      <FirstGameGuide />

      <section
        className="homeSecondaryActions homeUtilityRow"
        aria-labelledby="home-more"
      >
        <div className="pageHeader">
          <span className="eyebrow">After setup</span>
          <h2 className="subheading" id="home-more">
            Keep exploring
          </h2>
        </div>
        <div className="buttonRow">
          <Link to="/games" className="button buttonSecondary">
            Browse active games
          </Link>
          <Link to="/leaderboard" className="button buttonSecondary">
            View leaderboard
          </Link>
        </div>
        <p className="muted">
          Local operator tools are still available in the{" "}
          <Link to="/dev">developer panel</Link>.
        </p>
      </section>
    </div>
  );
}
