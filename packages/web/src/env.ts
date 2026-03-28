/** Centralized Vite env; mirrors repo-root `.env.example`. */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:8787",
  wsUrl: import.meta.env.VITE_WS_URL || "ws://localhost:8787",
  appName: import.meta.env.VITE_APP_NAME || "Oligopoly Online",
  appDomain: import.meta.env.VITE_APP_DOMAIN || "oligopoly.online",
  appEnv: import.meta.env.VITE_APP_ENV || "development",
} as const;
