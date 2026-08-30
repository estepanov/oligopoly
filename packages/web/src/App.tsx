import { Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "./components/AuthContext";
import { Layout } from "./components/Layout";
import { ThemeProvider } from "./components/ThemeContext";
import { DevPage } from "./pages/DevPage";
import { GameDetailPage } from "./pages/GameDetailPage";
import { GamesPage } from "./pages/GamesPage";
import { HomePage } from "./pages/HomePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { LobbiesPage } from "./pages/LobbiesPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";

/** Remount the session owner when the route game changes so presentation /
 * canonical state never has to reconcile two tables in one hook instance. */
function GameDetailRoute() {
  const { id } = useParams<{ id: string }>();
  return <GameDetailPage key={id} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/lobbies" element={<LobbiesPage />} />
            <Route path="/dev" element={<DevPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/:id" element={<GameDetailRoute />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
