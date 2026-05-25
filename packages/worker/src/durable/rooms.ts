import { normalizeGameState } from "@oligopoly/shared";

type RoomEnv = {
  DB?: D1Database;
};

function jsonEvent(type: string, payload: Record<string, unknown>) {
  return JSON.stringify({ type, sentAt: Date.now(), ...payload });
}

abstract class RealtimeRoom {
  protected sessions = new Set<WebSocket>();

  constructor(
    protected readonly state: DurableObjectState,
    protected readonly env: RoomEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.searchParams.has("notify")) {
      const body = await request.text();
      this.broadcast(body);
      return new Response("ok");
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.add(server);
    server.addEventListener("close", () => this.sessions.delete(server));
    server.addEventListener("error", () => this.sessions.delete(server));
    server.send(await this.snapshotEvent(request));

    return new Response(null, { status: 101, webSocket: client });
  }

  protected broadcast(message: string) {
    for (const session of this.sessions) {
      try {
        session.send(message);
      } catch {
        this.sessions.delete(session);
      }
    }
  }

  protected abstract snapshotEvent(request: Request): Promise<string>;
}

export class LobbyRoom extends RealtimeRoom {
  protected async snapshotEvent(request: Request): Promise<string> {
    const lobbyId = new URL(request.url).searchParams.get("lobbyId") ?? "";
    const payload = await this.loadLobbyPayload(lobbyId);
    return jsonEvent("lobby.snapshot", { lobbyId, payload });
  }

  private async loadLobbyPayload(lobbyId: string) {
    if (!this.env.DB || !lobbyId) {
      return { lobbyId, connected: true };
    }

    const lobby = await this.env.DB.prepare(
      "SELECT id, name, host_id, status, max_players, is_private, optional_rule_ids_json, created_at, ai_slots_json FROM lobbies WHERE id = ?",
    )
      .bind(lobbyId)
      .first<{
        id: string;
        name: string;
        host_id: string;
        status: string;
        max_players: number;
        is_private: number;
        optional_rule_ids_json: string | null;
        created_at: number;
        ai_slots_json: string | null;
      }>();

    if (!lobby) {
      return { lobbyId, connected: true, missing: true };
    }

    const playersResult = await this.env.DB.prepare(
      "SELECT user_id, is_admin, joined_at FROM lobby_players WHERE lobby_id = ? ORDER BY joined_at ASC",
    )
      .bind(lobbyId)
      .all<{ user_id: string; is_admin: number; joined_at: number }>();

    let aiSlots: unknown[] = [];
    if (lobby.ai_slots_json) {
      try {
        aiSlots = JSON.parse(lobby.ai_slots_json) as unknown[];
      } catch {
        aiSlots = [];
      }
    }

    return {
      id: lobby.id,
      name: lobby.name,
      hostId: lobby.host_id,
      status: lobby.status,
      maxPlayers: lobby.max_players,
      isPrivate: lobby.is_private === 1,
      optionalRuleIds: lobby.optional_rule_ids_json
        ? JSON.parse(lobby.optional_rule_ids_json)
        : [],
      createdAt: lobby.created_at,
      aiSlots,
      players: playersResult.results.map((player) => ({
        userId: player.user_id,
        isAdmin: player.is_admin === 1,
        joinedAt: player.joined_at,
      })),
    };
  }
}

export class GameRoom extends RealtimeRoom {
  protected async snapshotEvent(request: Request): Promise<string> {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId") ?? "";
    const spectator = url.searchParams.get("spectator") === "1";
    const payload = await this.loadGamePayload(gameId, spectator);
    return jsonEvent("game.snapshot", { gameId, payload });
  }

  private async loadGamePayload(gameId: string, spectator: boolean) {
    if (!this.env.DB || !gameId) {
      return { gameId, spectator, connected: true };
    }

    const row = await this.env.DB.prepare(
      "SELECT state_json FROM games WHERE id = ?",
    )
      .bind(gameId)
      .first<{ state_json: string | null }>();

    if (!row?.state_json) {
      return { gameId, spectator, connected: true, missing: true };
    }

    const raw = JSON.parse(row.state_json) as Record<string, unknown>;
    const gameState = normalizeGameState(raw);
    const { affinityAssignments: _hidden, ...publicState } = gameState;
    return { ...publicState, gameId, spectator };
  }
}
