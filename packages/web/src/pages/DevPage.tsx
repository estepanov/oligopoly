import type { HealthResponse } from "@oligopoly/validation";
import { useCallback, useEffect, useState } from "react";
import { fetchGameConfig } from "../api/game-config";
import { stepAiTurn } from "../api/games";
import { fetchHealth } from "../api/health";
import { ApiError } from "../api/http";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export function DevPage() {
  const [healthState, setHealthState] = useState<LoadState>({ kind: "idle" });
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const [configState, setConfigState] = useState<LoadState>({ kind: "idle" });
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [debugGameId, setDebugGameId] = useState("");
  const [aiStepMessage, setAiStepMessage] = useState<string | null>(null);
  const [aiStepBusy, setAiStepBusy] = useState(false);

  const loadHealth = useCallback(async () => {
    setHealthState({ kind: "loading" });
    try {
      const data = await fetchHealth();
      setHealth(data);
      setHealthState({ kind: "idle" });
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Failed to reach worker";
      setHealth(null);
      setHealthState({ kind: "error", message });
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setConfigState({ kind: "loading" });
    try {
      const data = await fetchGameConfig();
      setConfig(data);
      setConfigState({ kind: "idle" });
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Failed to load game config";
      setConfig(null);
      setConfigState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    void loadConfig();
  }, [loadHealth, loadConfig]);

  return (
    <div>
      <h1 className="pageTitle">Developer</h1>
      <p className="tagline">Local API status and configuration</p>

      <div className="card">
        <h2>Worker health</h2>
        {healthState.kind === "loading" && <p className="muted">Checking…</p>}
        {healthState.kind === "error" && (
          <p className="errorText">{healthState.message}</p>
        )}
        {health && (
          <p className="ok">
            Status: {health.status} | Service: {health.service} | Time:{" "}
            {new Date(health.timestamp).toLocaleString()}
          </p>
        )}
        <p style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="button buttonSecondary"
            onClick={() => void loadHealth()}
          >
            Refresh health
          </button>
        </p>
      </div>

      <div className="card">
        <h2>Game configuration</h2>
        {configState.kind === "loading" && <p className="muted">Loading…</p>}
        {configState.kind === "error" && (
          <p className="errorText">{configState.message}</p>
        )}
        {config && (
          <div className="configGrid">
            {Object.entries(config).map(([k, v]) => (
              <div key={k} className="configRow">
                <strong>{k}:</strong>{" "}
                <code className="inline">{JSON.stringify(v)}</code>
              </div>
            ))}
          </div>
        )}
        <p style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="button buttonSecondary"
            onClick={() => void loadConfig()}
          >
            Refresh config
          </button>
        </p>
      </div>

      <div className="card">
        <h2>AI step (debug)</h2>
        <p className="muted">
          Manual <code className="inline">POST /api/games/:id/ai/step</code> for
          local debugging. Production play relies on GameRoom automation.
        </p>
        <p style={{ marginTop: "1rem" }}>
          <label className="muted" htmlFor="debug-game-id">
            Game ID
          </label>
          <input
            id="debug-game-id"
            value={debugGameId}
            onChange={(event) => setDebugGameId(event.target.value)}
            placeholder="game id"
            style={{
              display: "block",
              width: "100%",
              maxWidth: "28rem",
              marginTop: "0.35rem",
            }}
          />
        </p>
        {aiStepMessage && <p className="muted">{aiStepMessage}</p>}
        <p style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={aiStepBusy || !debugGameId.trim()}
            onClick={() => {
              void (async () => {
                setAiStepBusy(true);
                setAiStepMessage(null);
                try {
                  const next = await stepAiTurn(debugGameId.trim());
                  setAiStepMessage(
                    next.aiAction
                      ? `AI ${next.aiPlayerId} chose ${next.aiAction.type}`
                      : `Step complete (phase: ${next.phase ?? "unknown"})`,
                  );
                } catch (e) {
                  setAiStepMessage(
                    e instanceof ApiError ? e.message : "AI step failed",
                  );
                } finally {
                  setAiStepBusy(false);
                }
              })();
            }}
          >
            Step AI
          </button>
        </p>
      </div>
    </div>
  );
}
