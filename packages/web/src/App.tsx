import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DevPage } from "./pages/DevPage";
import { GameDetailPage } from "./pages/GameDetailPage";
import { GamesPage } from "./pages/GamesPage";
import { HomePage } from "./pages/HomePage";
import { LobbiesPage } from "./pages/LobbiesPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/lobbies" element={<LobbiesPage />} />
        <Route path="/dev" element={<DevPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/:id" element={<GameDetailPage />} />
      </Route>
    </Routes>
  );
}
