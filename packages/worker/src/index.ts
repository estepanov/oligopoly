import {
  ACHIEVEMENTS_REGISTRY,
  AFFINITY_CARDS,
  DIAGONAL_TILES,
  DISRUPTION_DECK,
  MARKET_EVENT_DECK,
  OPTIONAL_MARKET_EVENT_CARDS_REGISTRY,
  OPTIONAL_RULES_REGISTRY,
  PERIMETER_TILES,
  RANK_THRESHOLDS,
  SECTORS,
  TOTAL_BOARD_MARKET_VALUE,
} from "@oligopoly/shared";
import type { HealthResponse } from "@oligopoly/validation";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authSubjectMiddleware } from "./middleware/authSubject";
import { banCacheMiddleware } from "./middleware/banCache";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { callsRoutes } from "./routes/calls";
import { gameRoutes } from "./routes/games";
import { leaderboardRoutes } from "./routes/leaderboard";
import { lobbyRoutes } from "./routes/lobbies";
import { userRoutes } from "./routes/users";
import type { OpenRouterAiEnv } from "./services/openRouterAi";

export { GameRoom, LobbyRoom } from "./durable/rooms";

type Bindings = OpenRouterAiEnv & {
  ALLOWED_ORIGINS?: string;
  DB?: D1Database;
  KV?: KVNamespace;
  CF_CALLS_APP_ID?: string;
  CF_CALLS_APP_SECRET?: string;
  WEBAUTHN_RP_ID?: string;
  WEBAUTHN_RP_NAME?: string;
  WEBAUTHN_ORIGIN?: string;
  LOBBY_ROOM?: DurableObjectNamespace;
  GAME_ROOM?: DurableObjectNamespace;
};

type Variables = {
  userId?: string;
  userRole?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env?.ALLOWED_ORIGINS?.split(",") ?? [
        "http://localhost:5173",
      ];
      return allowed.includes(origin) ? origin : "";
    },
  }),
);
app.use("*", authSubjectMiddleware);
app.use("*", rateLimitMiddleware);
app.use("*", banCacheMiddleware);

app.get("/api/health", (c) => {
  const response: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
    service: "oligopoly-worker",
  };
  return c.json(response);
});

app.get("/api/game-config", (c) => {
  return c.json({
    appName: "Oligopoly Online",
    version: "0.0.1",
    boardSize: 40,
    expressPathSize: 5,
    maxPlayers: 6,
    minPlayers: 2,
    startingCash: 1500,
    trustworthinessDefault: 7,
    totalBoardMarketValue: TOTAL_BOARD_MARKET_VALUE,
    sectors: SECTORS,
    perimeterTiles: PERIMETER_TILES,
    diagonalTiles: DIAGONAL_TILES,
    marketEventDeck: MARKET_EVENT_DECK,
    disruptionDeck: DISRUPTION_DECK,
    affinityCards: AFFINITY_CARDS,
    rankThresholds: RANK_THRESHOLDS,
    achievements: ACHIEVEMENTS_REGISTRY,
    optionalRules: OPTIONAL_RULES_REGISTRY,
    optionalMarketEventCards: OPTIONAL_MARKET_EVENT_CARDS_REGISTRY,
  });
});

app.route("/api/lobbies", lobbyRoutes);

app.route("/api/auth", authRoutes);

app.route("/api/admin", adminRoutes);
app.route("/api/games", gameRoutes);
app.route("/api/users", userRoutes);
app.route("/api/leaderboard", leaderboardRoutes);
app.route("/api/calls", callsRoutes);

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
