const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function checkHealth() {
  const el = document.getElementById("health-status")!;
  try {
    const res = await fetch(`${API_URL}/api/health`);
    const data = await res.json();
    el.textContent = `Status: ${data.status} | Service: ${data.service} | Time: ${new Date(data.timestamp).toLocaleString()}`;
    el.className = "ok";
  } catch {
    el.textContent = "Worker unreachable";
    el.className = "error";
  }
}

async function loadGameConfig() {
  const el = document.getElementById("game-config")!;
  try {
    const res = await fetch(`${API_URL}/api/game-config`);
    const config = await res.json();
    el.innerHTML = Object.entries(config)
      .map(
        ([k, v]) =>
          `<div><strong>${k}:</strong> <code>${JSON.stringify(v)}</code></div>`,
      )
      .join("");
  } catch {
    el.textContent = "Failed to load game config";
  }
}

(window as unknown as Record<string, unknown>).checkHealth = checkHealth;

checkHealth();
loadGameConfig();
