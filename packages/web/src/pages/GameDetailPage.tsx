import type { GameSummary } from "@oligopoly/validation";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchGameSummary } from "../api/games";
import { ApiError } from "../api/http";

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<GameSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setGame(null);
      setError("Missing game id");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const summary = await fetchGameSummary(id);
        if (!cancelled) {
          setGame(summary);
        }
      } catch (e) {
        if (!cancelled) {
          setGame(null);
          if (e instanceof ApiError && e.status === 404) {
            setError("Game not found.");
          } else {
            setError(e instanceof ApiError ? e.message : "Failed to load game");
          }
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
  }, [id]);

  if (!id) {
    return (
      <div>
        <p className="errorText">Invalid route.</p>
        <Link to="/games">← Back to games</Link>
      </div>
    );
  }

  return (
    <div>
      <p style={{ marginBottom: "1rem" }}>
        <Link to="/games">← All games</Link>
      </p>
      <h1 className="pageTitle">Game</h1>
      <p className="tagline">
        <code className="inline">{id}</code>
      </p>

      <div className="card">
        <h2>Summary</h2>
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="errorText">{error}</p>}
        {!loading && !error && game && (
          <dl
            style={{
              display: "grid",
              gap: "0.5rem 1rem",
              gridTemplateColumns: "auto 1fr",
            }}
          >
            <dt className="muted">Status</dt>
            <dd>{game.status}</dd>
            <dt className="muted">Players</dt>
            <dd>{game.playerCount}</dd>
            <dt className="muted">Started</dt>
            <dd>{new Date(game.startedAt).toLocaleString()}</dd>
            <dt className="muted">Ended</dt>
            <dd>
              {game.endedAt !== null
                ? new Date(game.endedAt).toLocaleString()
                : "—"}
            </dd>
            <dt className="muted">Winner</dt>
            <dd>{game.winnerId ?? "—"}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
