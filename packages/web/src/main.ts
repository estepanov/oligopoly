import {
  createRateLimiter,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "./rateLimit";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

const getElementById = (id: string): HTMLElement | null =>
  document.getElementById(id);

const webRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
});
let latestHealthRequestId = 0;

async function webRateLimitedFetch(path: string): Promise<Response> {
  if (webRateLimiter.checkAndTrack()) {
    throw new Error("web_rate_limited");
  }
  return fetch(`${API_URL}${path}`);
}

async function checkHealth() {
  const el = getElementById("health-status");
  if (!el) {
    return;
  }
  const requestId = ++latestHealthRequestId;

  try {
    const res = await webRateLimitedFetch("/api/health");
    const data = await res.json();
    if (requestId !== latestHealthRequestId) {
      return;
    }
    el.textContent = `Status: ${data.status} | Service: ${data.service} | Time: ${new Date(data.timestamp).toLocaleString()}`;
    el.className = "ok";
  } catch (error) {
    if (requestId !== latestHealthRequestId) {
      return;
    }
    if (error instanceof Error && error.message === "web_rate_limited") {
      el.textContent = "Too many refreshes. Please wait a moment.";
      el.className = "error";
      return;
    }
    el.textContent = "Worker unreachable";
    el.className = "error";
  }
}

async function loadGameConfig() {
  const el = getElementById("game-config");
  if (!el) {
    return;
  }

  try {
    const res = await webRateLimitedFetch("/api/game-config");
    const config = await res.json();
    el.innerHTML = Object.entries(config)
      .map(
        ([k, v]) =>
          `<div><strong>${k}:</strong> <code>${JSON.stringify(v)}</code></div>`,
      )
      .join("");
  } catch (error) {
    if (error instanceof Error && error.message === "web_rate_limited") {
      el.textContent = "Rate limited in browser. Retry in a few seconds.";
      return;
    }
    el.textContent = "Failed to load game config";
  }
}

(window as unknown as Record<string, unknown>).checkHealth = checkHealth;

checkHealth();
loadGameConfig();
