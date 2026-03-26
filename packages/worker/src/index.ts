import type { HealthResponse } from "@oligopoly/validation";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { banCacheMiddleware } from "./middleware/banCache";

type Bindings = {
  ALLOWED_ORIGINS?: string;
  KV?: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env?.ALLOWED_ORIGINS?.split(",") ?? [
        "http://localhost:5173",
        "http://172.30.0.2:5173",
      ];
      return allowed.includes(origin) ? origin : "";
    },
  }),
);
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
  });
});

app.all("/api/auth/*", (c) => {
  return c.json({ error: "Auth adapter not configured" }, 501);
});

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
