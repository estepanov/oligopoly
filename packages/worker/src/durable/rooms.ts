import { hasAiWork, normalizeGameState } from "@oligopoly/shared";
import { GameErrorKeys } from "@oligopoly/validation";
import {
  redactLogEntriesForViewer,
  toClientGameStateFromInternal,
} from "../gameStateView.js";
import { isNotifyRequest } from "../realtime/notify.js";
import {
  AI_LOOP_MAX_STEPS,
  applyAuctionBidWindowExpiry,
  applyAuctionSettleExpiry,
  applyTimeoutTakeoverAndStep,
  applyTradeOfferExpiry,
  runAiTurnLoop,
} from "../services/gameAi.js";
import { prepareGameBroadcastPayload } from "../services/gamePersistence.js";
import { syncGameRoomTimer } from "../services/gameScheduler.js";
import {
  buildLobbyResponse,
  type LobbyPlayerRow,
  type LobbyRow,
} from "../services/lobbyResponses.js";
import type { OpenRouterAiEnv } from "../services/openRouterAi.js";

type RoomEnv = OpenRouterAiEnv & {
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
    // Internal fan-out POSTs are routed to the shared NOTIFY_PATH (carrying the
    // gameId/lobbyId as a query param). Match via the same helper the senders
    // use so the two can't drift on a magic string.
    if (request.method === "POST" && isNotifyRequest(url)) {
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
      const logEntries = Array.isArray(event.logEntries)
        ? (event.logEntries as Array<{
            actionType: string;
            payload: Record<string, unknown> | null;
          }>)
        : null;
      // Trade-offer terms are stripped from `event.state` at the broadcast
      // source and carried separately so they never leak to non-participants.
      // Re-inject them here before `toClientGameState`, which redacts them down
      // to each viewer's own offers via `filterTradeOffersForViewer`. Falls back
      // to any `tradeOffers` still on `event.state` for legacy/other callers.
      const carriedTradeOffers = Array.isArray(event.tradeOffers)
        ? event.tradeOffers
        : null;
      for (const session of this.sessions) {
        const url = this.sessionUrls.get(session);
        const spectator = url?.searchParams.get("spectator") === "1";
        const viewerId = url?.searchParams.get("viewerId") ?? "spectator";
        const rawState = carriedTradeOffers
          ? {
              ...(event.state as Record<string, unknown>),
              tradeOffers: carriedTradeOffers,
            }
          : (event.state as Record<string, unknown>);
        const state = normalizeGameState(rawState);
        const scopedState = spectator
          ? toClientGameStateFromInternal(state, "spectator", viewerId)
          : toClientGameStateFromInternal(state, "player", viewerId);
        const scopedLogEntries = logEntries
          ? redactLogEntriesForViewer(logEntries, spectator ? null : viewerId)
          : undefined;
        try {
          session.send(
            JSON.stringify({
              ...event,
              state: scopedState,
              ...(scopedLogEntries ? { logEntries: scopedLogEntries } : {}),
            }),
          );
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

  private async turnDeadlineReached(): Promise<boolean> {
    const turnDeadline = await this.state.storage.get<number>("turnDeadlineAt");
    return turnDeadline !== undefined && Date.now() >= turnDeadline;
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
      // Trade-offer expiry runs on every tick regardless of which kind won the
      // alarm race — it is idempotent and only acts on offers that are actually
      // expired.
      await applyTradeOfferExpiry(this.env.DB, gameId, this.env.GAME_ROOM);

      if (timerKind === "auction_bids") {
        await applyAuctionBidWindowExpiry(
          this.env.DB,
          gameId,
          this.env.GAME_ROOM,
          this.env.KV,
          this.env,
        );
      } else if (timerKind === "auction_settle") {
        await applyAuctionSettleExpiry(
          this.env.DB,
          gameId,
          this.env.GAME_ROOM,
          this.env.KV,
          this.env,
        );
      }

      // Independently of which kind won the alarm, take over the current turn
      // whenever the TURN deadline has actually passed. A plain `turn` alarm IS
      // the turn deadline, so this fires for it; a `trade_offer` alarm only
      // takes over once the turn deadline (not just the trade deadline) has also
      // elapsed. Auction phases clear `turnActorId`/`turnDeadlineAt`, so this is
      // a no-op for the auction kinds above.
      const actorId = await this.state.storage.get<string>("turnActorId");
      if (actorId && (await this.turnDeadlineReached())) {
        await applyTimeoutTakeoverAndStep(
          this.env.DB,
          gameId,
          actorId,
          this.env.GAME_ROOM,
          this.env.KV,
          this.env,
        );
      }
    } catch (err) {
      // An expiry/takeover helper persists with an optimistic guard and throws
      // `game.state_conflict` when another writer advanced the game first. That
      // is benign here: the other writer already moved state forward, so we just
      // resync + reschedule below rather than letting the alarm tick fail.
      if (err !== GameErrorKeys.STATE_CONFLICT) throw err;
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
      ? toClientGameStateFromInternal(gameState, "spectator", viewerId)
      : toClientGameStateFromInternal(gameState, "player", viewerId);
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

    // One canonical "is there AI work?" predicate (auction phase actors,
    // off-turn trade-inbox recipients, AND current-turn AI) so the DO reliably
    // wakes trade AI too — not just auction/current-turn AI. Mirrors the inline
    // `chooseAiAction` discovery so the DO is the reliable orchestration owner.
    if (
      this.env.DB &&
      !(await this.state.storage.get<boolean>("aiLoopRunning")) &&
      hasAiWork(state)
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
        AI_LOOP_MAX_STEPS,
        this.env.KV,
        this.env,
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
        // Carry trade-offer terms separately from `state` (see
        // `prepareGameBroadcastPayload`) so non-participants never receive them.
        const { state: latestWithoutTradeOffers, tradeOffers } =
          prepareGameBroadcastPayload(latest);
        this.broadcast(
          jsonEvent("game.schedule", {
            gameId,
            state: latestWithoutTradeOffers,
            ...(tradeOffers ? { tradeOffers } : {}),
          }),
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
