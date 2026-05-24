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
      session.send(message);
    }
  }

  protected abstract snapshotEvent(request: Request): Promise<string>;
}

export class LobbyRoom extends RealtimeRoom {
  protected async snapshotEvent(request: Request): Promise<string> {
    const lobbyId = new URL(request.url).searchParams.get("lobbyId") ?? "";
    return jsonEvent("lobby.snapshot", {
      lobbyId,
      payload: { lobbyId, connected: true },
    });
  }
}

export class GameRoom extends RealtimeRoom {
  protected async snapshotEvent(request: Request): Promise<string> {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId") ?? "";
    const spectator = url.searchParams.get("spectator") === "1";
    return jsonEvent("game.snapshot", {
      gameId,
      payload: { gameId, spectator, connected: true },
    });
  }
}
