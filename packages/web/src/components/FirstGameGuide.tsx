import { Link } from "react-router-dom";

type GuideStep = {
  label: string;
  detail: string;
};

type GuidePath = {
  title: string;
  description: string;
  steps: GuideStep[];
  cta: string;
  helper: string;
  href: string;
};

const guidePaths: GuidePath[] = [
  {
    title: "Play with a friend",
    description:
      "Best first table: two humans, a private lobby, and a shared invite.",
    steps: [
      {
        label: "Create a private lobby",
        detail: "Keep the table invite-only while you learn the flow.",
      },
      {
        label: "Invite player two",
        detail:
          "Share the lobby link or invite code, then wait for them to join.",
      },
      {
        label: "Ready up and start",
        detail:
          "Both players mark ready. The host starts when the table is set.",
      },
    ],
    cta: "Start a two-player game",
    helper: "You can add more players later, up to six total seats.",
    href: "/lobbies",
  },
  {
    title: "Practice solo vs AI",
    description:
      "Learn the board at your own pace with one human seat and AI opponents.",
    steps: [
      {
        label: "Create a lobby",
        detail: "Use your own account as the only human player.",
      },
      {
        label: "Add at least one AI seat",
        detail: "Choose a personality so the table has the required two seats.",
      },
      {
        label: "Mark ready",
        detail:
          "Start the lobby and let server-controlled AI handle its turns.",
      },
    ],
    cta: "Set up solo practice",
    helper: "AI follows the same legal actions and win conditions as humans.",
    href: "/lobbies?setup=solo-ai",
  },
];

export function FirstGameGuide() {
  return (
    <section
      className="firstGameGuide"
      aria-labelledby="first-game-guide-heading"
    >
      <div className="pageHeader firstGameGuideHeader">
        <span className="eyebrow">First game</span>
        <h2 className="subheading" id="first-game-guide-heading">
          Choose the table that fits tonight
        </h2>
        <p className="tagline">
          Oligopoly is easiest to learn when setup is simple: one friend or one
          AI opponent, then grow into bigger coalition games.
        </p>
      </div>

      <div className="firstGameGuideGrid">
        {guidePaths.map((path) => (
          <article className="firstGameGuideCard" key={path.title}>
            <div className="firstGameGuideCardHeader">
              <h3 className="subheading">{path.title}</h3>
              <p className="muted">{path.description}</p>
            </div>

            <ol className="firstGameSteps" aria-label={`${path.title} steps`}>
              {path.steps.map((step) => (
                <li className="firstGameStep" key={step.label}>
                  <strong>{step.label}</strong>
                  <span className="muted">{step.detail}</span>
                </li>
              ))}
            </ol>

            <div className="firstGameGuideActions">
              <Link to={path.href} className="button">
                {path.cta}
              </Link>
              <p className="muted">{path.helper}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
