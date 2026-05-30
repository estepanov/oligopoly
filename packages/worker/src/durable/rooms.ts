import {
  findNextAiActorForPhase,
  isAiControlledActor,
  normalizeGameState,
} from "@oligopoly/shared";
import { toClientGameState } from "../gameStateView.js";
import {
  applyAuctionBidWindowExpiry,
  applyAuctionSettleExpiry,
  applyTimeoutTakeoverAndStep,
  runAiTurnLoop,
} from "../services/gameAi.js";
import { publicStateForBroadcast } from "../services/gamePersistence.js";
import { syncGameRoomTimer } from "../services/gameScheduler.js";
import {
  buildLobbyResponse,
  type LobbyPlayerRow,
  type LobbyRow,
} from "../services/lobbyResponses.js";
import { currentTurnActorId } from "../services/turnTimeout.js";

type RoomEnv = {
  DB?: D1Database;
  GAME_ROOM?: DurableObjectNamespace;
  KV?: KVNamespace;
};

function jsonEvent(type: string, payload: Record<string, unknown>) {
  return JSON.stringify({ type, sentAt: Date.now(), ...payload });
}

abstract class RealtimeRoom {
  protected sessions = new Set<WebSocket>();
  protected sessionUrls = new Map<WebSocket, URL>();

  constructor(
    protected readonly state: DurableObjectState,
    protected readonly env: RoomEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.searchParams.has("notify")) {
      const body = await request.text();
      await this.handleNotify(body);
      return new Response("ok");
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.add(server);
    this.sessionUrls.set(server, new URL(request.url));
    server.addEventListener("close", () => {
      this.sessions.delete(server);
      this.sessionUrls.delete(server);
    });
    server.addEventListener("error", () => {
      this.sessions.delete(server);
      this.sessionUrls.delete(server);
    });
    server.send(await this.snapshotEvent(request));

    return new Response(null, { status: 101, webSocket: client });
  }

  protected async handleNotify(body: string): Promise<void> {
    this.broadcast(body);
  }

  protected broadcast(message: string) {
    for (const session of this.sessions) {
      try {
        session.send(message);
      } catch {
        this.sessions.delete(session);
        this.sessionUrls.delete(session);
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
      "SELECT * FROM lobbies WHERE id = ?",
    )
      .bind(lobbyId)
      .first<LobbyRow>();

    if (!lobby) {
      return { lobbyId, connected: true, missing: true };
    }

    const playersResult = await this.env.DB.prepare(
      "SELECT * FROM lobby_players WHERE lobby_id = ? ORDER BY joined_at ASC",
    )
      .bind(lobbyId)
      .all<LobbyPlayerRow>();

    return buildLobbyResponse(this.env.DB, lobby, playersResult.results);
  }
}

export class GameRoom extends RealtimeRoom {
  protected broadcast(message: string) {
    let event: Record<string, unknown> | null = null;
    try {
      event = JSON.parse(message) as Record<string, unknown>;
    } catch {
      event = null;
    }

    if (
      event &&
      (event.type === "game.action_applied" ||
        event.type === "game.schedule" ||
        event.type === "game.snapshot") &&
      event.state
    ) {
      for (const session of this.sessions) {
        const url = this.sessionUrls.get(session);
        const spectator = url?.searchParams.get("spectator") === "1";
        const viewerId = url?.searchParams.get("viewerId") ?? "spectator";
        const state = normalizeGameState(
          event.state as Record<string, unknown>,
        );
        const scopedState = spectator
          ? toClientGameState(state as never, "spectator", viewerId)
          : toClientGameState(state as never, "player", viewerId);
        try {
          session.send(JSON.stringify({ ...event, state: scopedState }));
        } catch {
          this.sessions.delete(session);
          this.sessionUrls.delete(session);
        }
      }
      return;
    }

    super.broadcast(message);
  }

  protected async handleNotify(body: string): Promise<void> {
    if (await this.state.storage.get<boolean>("aiLoopRunning")) {
      this.broadcast(body);
      return;
    }

    await super.handleNotify(body);

    try {
      const event = JSON.parse(body) as {
        type?: string;
        gameId?: string;
        state?: Record<string, unknown>;
      };
      if (
        (event.type === "game.action_applied" ||
          event.type === "game.schedule") &&
        event.gameId &&
        event.state
      ) {
        await this.syncAfterStateChange(event.gameId, event.state);
      }
    } catch {
      // Ignore malformed notify payloads.
    }
  }

  async alarm(): Promise<void> {
    const gameId = await this.state.storage.get<string>("gameId");
    if (!gameId || !this.env.DB) return;

    const timerKind =
      (await this.state.storage.get<string>("timerKind")) ?? "turn";
    const deadline =
      (await this.state.storage.get<number>("timerDeadlineAt")) ??
      (await this.state.storage.get<number>("turnDeadlineAt"));
    if (deadline && Date.now() < deadline) {
      await this.state.storage.setAlarm(deadline);
      return;
    }

    await this.state.storage.put("aiLoopRunning", true);
    try {
      if (timerKind === "auction_bids") {
        await applyAuctionBidWindowExpiry(
          this.env.DB,
          gameId,
          this.env.GAME_ROOM,
        );
      } else if (timerKind === "auction_settle") {
        await applyAuctionSettleExpiry(this.env.DB, gameId, this.env.GAME_ROOM);
      } else {
        const actorId = await this.state.storage.get<string>("turnActorId");
        if (!actorId) return;
        await applyTimeoutTakeoverAndStep(
          this.env.DB,
          gameId,
          actorId,
          this.env.GAME_ROOM,
        );
      }
    } finally {
      await this.state.storage.delete("aiLoopRunning");
      await this.resyncFromDatabase(gameId);
    }
  }

  protected async snapshotEvent(request: Request): Promise<string> {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId") ?? "";
    const spectator = url.searchParams.get("spectator") === "1";
    const viewerId = url.searchParams.get("viewerId") ?? "spectator";
    if (gameId) {
      await this.state.storage.put("gameId", gameId);
    }
    const payload = await this.loadGamePayload(gameId, spectator, viewerId);
    return jsonEvent("game.snapshot", { gameId, payload });
  }

  private async loadGamePayload(
    gameId: string,
    spectator: boolean,
    viewerId: string,
  ) {
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
    return spectator
      ? toClientGameState(gameState as never, "spectator", viewerId)
      : toClientGameState(gameState as never, "player", viewerId);
  }

  private async resyncFromDatabase(gameId: string) {
    if (!this.env.DB) return;

    const row = await this.env.DB.prepare(
      "SELECT state_json FROM games WHERE id = ?",
    )
      .bind(gameId)
      .first<{ state_json: string | null }>();

    if (!row?.state_json) return;

    await this.syncAfterStateChange(
      gameId,
      JSON.parse(row.state_json) as Record<string, unknown>,
    );
  }

  private async syncAfterStateChange(
    gameId: string,
    rawState: Record<string, unknown>,
  ) {
    await this.state.storage.put("gameId", gameId);
    const state = normalizeGameState(rawState);

    if (state.phase === "game_over") {
      await this.state.storage.deleteAlarm();
      return;
    }

    if (
      this.env.DB &&
      !(await this.state.storage.get<boolean>("aiLoopRunning")) &&
      findNextAiActorForPhase(state)
    ) {
      await this.runAiLoop(gameId);
      return;
    }

    if (
      state.phase === "waiting_for_auction_bids" ||
      state.phase === "waiting_for_auction_settle"
    ) {
      await syncGameRoomTimer(this.state.storage, gameId, state, (message) =>
        this.broadcast(message),
      );
      return;
    }

    const actorId = currentTurnActorId(state);
    if (!actorId) return;

    if (
      isAiControlledActor(state, actorId) &&
      this.env.DB &&
      !(await this.state.storage.get<boolean>("aiLoopRunning"))
    ) {
      await this.runAiLoop(gameId);
      return;
    }

    await syncGameRoomTimer(this.state.storage, gameId, state, (message) =>
      this.broadcast(message),
    );
  }

  private async runAiLoop(gameId: string) {
    if (!this.env.DB) return;

    await this.state.storage.put("aiLoopRunning", true);
    try {
      await runAiTurnLoop(
        this.env.DB,
        gameId,
        this.env.GAME_ROOM,
        16,
        this.env.KV,
      );
      const row = await this.env.DB.prepare(
        "SELECT state_json FROM games WHERE id = ?",
      )
        .bind(gameId)
        .first<{ state_json: string | null }>();
      if (row?.state_json) {
        const latest = normalizeGameState(
          JSON.parse(row.state_json) as Record<string, unknown>,
        );
        await syncGameRoomTimer(this.state.storage, gameId, latest, (message) =>
          this.broadcast(message),
        );
      }
    } finally {
      await this.state.storage.delete("aiLoopRunning");
    }
  }
}
