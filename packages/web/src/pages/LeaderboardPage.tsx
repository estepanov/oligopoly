import { useEffect, useState } from "react";
import {
  fetchLeaderboardCompletions,
  fetchLeaderboardWins,
} from "../api/leaderboard";

type Entry = {
  userId: string;
  username: string;
  wins?: number;
  completions?: number;
};

export function LeaderboardPage() {
  const [wins, setWins] = useState<Entry[]>([]);
  const [completions, setCompletions] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [winsBody, completionsBody] = await Promise.all([
          fetchLeaderboardWins(),
          fetchLeaderboardCompletions(),
        ]);
        if (cancelled) return;
        setWins(winsBody.entries);
        setCompletions(completionsBody.entries);
      } catch {
        if (!cancelled) setError("Could not load leaderboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="pageTitle">Leaderboard</h1>
      <p className="tagline">Top players by wins and completed games.</p>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="errorText">{error}</p>}
      {!loading && !error && (
        <div className="leaderboardGrid">
          <div className="card">
            <h2>Most wins</h2>
            {wins.length === 0 ? (
              <p className="muted">No entries yet.</p>
            ) : (
              <ol>
                {wins.map((entry, index) => (
                  <li key={entry.userId}>
                    #{index + 1} {entry.username} — {entry.wins ?? 0} wins
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="card">
            <h2>Most completions</h2>
            {completions.length === 0 ? (
              <p className="muted">No entries yet.</p>
            ) : (
              <ol>
                {completions.map((entry, index) => (
                  <li key={entry.userId}>
                    #{index + 1} {entry.username} — {entry.completions ?? 0}{" "}
                    games
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
