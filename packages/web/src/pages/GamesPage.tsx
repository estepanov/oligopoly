import type { GameSummary } from "@oligopoly/validation";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGamesList } from "../api/games";
import { ApiError } from "../api/http";

export function GamesPage() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { games: list } = await fetchGamesList();
        if (!cancelled) {
          setGames(list);
        }
      } catch (e) {
        if (!cancelled) {
          setGames(null);
          setError(
            e instanceof ApiError ? e.message : "Failed to load games list",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="pageTitle">Games</h1>
      <p className="tagline">Games returned by GET /api/games</p>

      <div className="card">
        <h2>All games</h2>
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="errorText">{error}</p>}
        {!loading && !error && games && games.length === 0 && (
          <p className="emptyState">No games yet (empty list is normal).</p>
        )}
        {!loading && !error && games && games.length > 0 && (
          <table className="gamesTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Players</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link to={`/games/${g.id}`}>{g.id}</Link>
                  </td>
                  <td>{g.status}</td>
                  <td>{g.playerCount}</td>
                  <td>{new Date(g.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
