import type { GameState } from "@oligopoly/validation";

type PlayerSummaryPanelProps = {
  state: GameState;
  myPlayerId: string | null;
};

export function PlayerSummaryPanel({
  state,
  myPlayerId,
}: PlayerSummaryPanelProps) {
  const players = state.players ?? [];
  const currency = state.settings?.currencySymbol ?? "¤";

  return (
    <div className="card">
      <h2>Players</h2>
      <ul className="playerSummaryList">
        {players.map((player) => {
          const mortgaged = player.mortgagedTilePositions.length;
          const tokens = Object.values(player.developmentTokens).reduce(
            (sum, count) => sum + count,
            0,
          );
          const isMe = player.playerId === myPlayerId;

          return (
            <li key={player.playerId} className="playerSummaryItem">
              <strong>
                {player.displayName ?? player.playerId}
                {isMe ? " (you)" : ""}
              </strong>
              <dl className="detailsGrid">
                <dt className="muted">Capital</dt>
                <dd>
                  {currency}
                  {player.capital}
                </dd>
                <dt className="muted">Tiles owned</dt>
                <dd>{player.ownedTilePositions.length}</dd>
                <dt className="muted">Mortgaged</dt>
                <dd>{mortgaged}</dd>
                <dt className="muted">Development tokens</dt>
                <dd>{tokens}</dd>
                <dt className="muted">Trustworthiness</dt>
                <dd>{player.trustworthiness}</dd>
                {player.syndicateId && (
                  <>
                    <dt className="muted">Syndicate</dt>
                    <dd>
                      <code className="inline">{player.syndicateId}</code>
                    </dd>
                  </>
                )}
                {(player.outstandingDebt ?? 0) > 0 && isMe && (
                  <>
                    <dt className="muted">Debt</dt>
                    <dd>
                      {currency}
                      {player.outstandingDebt}
                    </dd>
                  </>
                )}
                {player.inRegulation && (
                  <>
                    <dt className="muted">Regulation</dt>
                    <dd>Serving penalty</dd>
                  </>
                )}
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
