import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyAchievements, fetchMyGames, fetchMyRank } from "../api/profile";
import { useAuth } from "../components/AuthContext";

export function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const [rank, setRank] = useState<{
    tier: number;
    title: string | null;
    rankPoints: number;
  } | null>(null);
  const [achievements, setAchievements] = useState<
    Array<{ id: string; unlockedAt: number }>
  >([]);
  const [games, setGames] = useState<
    Array<{
      gameId: string;
      status: string;
      startedAt: number;
      endedAt: number | null;
      winnerId: string | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [rankBody, achievementBody, gamesBody] = await Promise.all([
          fetchMyRank(),
          fetchMyAchievements(),
          fetchMyGames(),
        ]);
        if (cancelled) return;
        setRank(rankBody);
        setAchievements(achievementBody);
        setGames(gamesBody);
      } catch {
        if (!cancelled) setError("Could not load profile data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) {
    return <p className="muted">Loading account…</p>;
  }

  if (!user) {
    return (
      <div>
        <h1 className="pageTitle">Profile</h1>
        <p className="muted">
          <Link to="/login?returnTo=/profile">Sign in</Link> to view your rank,
          achievements, and game history.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="pageTitle">Profile</h1>
      <p className="tagline">
        Signed in as <strong>{user.username}</strong>
      </p>
      {loading && <p className="muted">Loading profile…</p>}
      {error && <p className="errorText">{error}</p>}
      {!loading && !error && rank && (
        <>
          <div className="card">
            <h2>Rank</h2>
            <dl className="detailsGrid">
              <dt className="muted">Tier</dt>
              <dd>{rank.tier}</dd>
              <dt className="muted">Title</dt>
              <dd>{rank.title ?? "—"}</dd>
              <dt className="muted">Rank points</dt>
              <dd>{rank.rankPoints}</dd>
            </dl>
          </div>
          <div className="card">
            <h2>Achievements</h2>
            {achievements.length === 0 ? (
              <p className="muted">No achievements unlocked yet.</p>
            ) : (
              <ul className="plainList">
                {achievements.map((entry) => (
                  <li key={entry.id}>
                    <code className="inline">{entry.id}</code> — unlocked{" "}
                    {new Date(entry.unlockedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h2>Recent games</h2>
            {games.length === 0 ? (
              <p className="muted">No games recorded yet.</p>
            ) : (
              <ul className="plainList">
                {games.map((game) => (
                  <li key={game.gameId}>
                    <Link to={`/games/${game.gameId}`}>{game.gameId}</Link> —{" "}
                    {game.status}
                    {game.winnerId ? ` (winner: ${game.winnerId})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
