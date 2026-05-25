import { describe, expect, it } from "vitest";
import {
  advanceAuctionSettle,
  completeCoordinationPhase,
  createAndStartGame,
  createD1Stub,
  drawRoundStartMarketEvent,
  type HarnessDb,
  loadStoredGameState,
  markLobbyPlayersReady,
  requestWithEnv,
  storedActorId,
} from "../helpers/workerGameplayHarness.js";

describe("POST /api/games/:id/action — draw_market_event", () => {
  it("starts games in waiting_for_market_event and resolves the round-start draw", async () => {
    const db = createD1Stub();
    const createRes = await requestWithEnv("/api/lobbies", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: {
        name: "Market Event Lobby",
        maxPlayers: 4,
        isPrivate: false,
        optionalRuleIds: [],
      },
      db,
    });
    const lobby = (await createRes.json()) as Record<string, unknown>;

    await requestWithEnv(`/api/lobbies/${lobby.id}/join`, {
      method: "POST",
      headers: { "x-subject": "user-2" },
      db,
    });
    await markLobbyPlayersReady(db, lobby.id as string, ["user-1", "user-2"]);

    const startRes = await requestWithEnv(`/api/lobbies/${lobby.id}/start`, {
      method: "POST",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(startRes.status).toBe(200);
    const startBody = (await startRes.json()) as Record<string, unknown>;
    const gameId = startBody.gameId as string;

    const stateRes = await requestWithEnv(`/api/games/${gameId}/state`, {
      method: "GET",
      headers: { "x-subject": "user-1" },
      db,
    });
    expect(stateRes.status).toBe(200);
    const initialState = (await stateRes.json()) as Record<string, unknown>;
    expect(initialState.phase).toBe("waiting_for_market_event");

    const storedState = loadStoredGameState(db as HarnessDb, gameId);
    const actorId = storedActorId(storedState);

    const drawRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": actorId },
      body: { type: "draw_market_event" },
      db,
    });
    expect(drawRes.status).toBe(200);
    const drawBody = (await drawRes.json()) as Record<string, unknown>;
    expect(drawBody.phase).toBe("waiting_for_roll");
  });
});

describe("POST /api/games/:id/action — basics", () => {
  it("returns 401 without auth", async () => {
    const db = createD1Stub();
    const { gameId } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown game", async () => {
    const db = createD1Stub();
    const res = await requestWithEnv("/api/games/nonexistent/action", {
      method: "POST",
      headers: { "x-subject": "user-1" },
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a player in the game", async () => {
    const db = createD1Stub();
    const { gameId } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": "user-3" },
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when it is not the player's turn", async () => {
    const db = createD1Stub();
    const { gameId, otherPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [3, 4] },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.not_your_turn");
  });

  it("rejects invalid dice values via schema validation", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [0, 7] },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.invalid_action");
  });

  it("rejects unknown action types via schema validation", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "hack_game" },
      db,
    });
    expect(res.status).toBe(400);
  });

  it("rejects end_turn before rolling dice", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.cannot_end_turn");
  });
});

describe("POST /api/games/:id/action — roll_dice", () => {
  it("successfully rolls dice and moves the current player", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 3] },
      db,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.lastDiceRoll).toEqual([2, 3]);

    const players = body.players as Array<{
      playerId: string;
      position: number | string;
    }>;
    const movedPlayer = players.find((p) => p.playerId === currentPlayer);
    expect(movedPlayer).toBeDefined();
    expect(movedPlayer?.position).toBe(5);
  });

  it("returns 400 when trying to roll again without doubles", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // First roll (non-doubles)
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 3] },
      db,
    });

    // Second roll should fail (action phase, not waiting for roll)
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 4] },
      db,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("game.already_rolled");
  });
});

describe("POST /api/games/:id/action — buy_tile / decline_tile", () => {
  it("can buy a tile from position 1 (Digital Content Co., cost 60)", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, capitals } = await createAndStartGame(db);

    // Roll [1, 2] = 3 -> position 3 = Mobile Gaming Inc. (cost 80)
    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    const rollBody = (await rollRes.json()) as Record<string, unknown>;
    expect(rollBody.phase).toBe("waiting_for_buy");
    expect(rollBody.pendingBuyTilePosition).toBe(3);

    // Buy the tile
    const buyRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });
    expect(buyRes.status).toBe(200);
    const buyBody = (await buyRes.json()) as Record<string, unknown>;
    expect(buyBody.pendingBuyTilePosition).toBeNull();

    const players = buyBody.players as Array<{
      playerId: string;
      capital: number;
      ownedTilePositions: number[];
    }>;
    const buyer = players.find((p) => p.playerId === currentPlayer)!;
    const purchaseCost = capitals[currentPlayer] - buyer.capital;
    expect(purchaseCost).toBeGreaterThanOrEqual(68);
    expect(purchaseCost).toBeLessThanOrEqual(80);
    expect(buyer.ownedTilePositions).toContain(3);
  });

  it("starts a sealed auction when a tile is declined", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });

    const declineRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "decline_tile", tilePosition: 3 },
      db,
    });
    expect(declineRes.status).toBe(200);
    const declineBody = (await declineRes.json()) as Record<string, unknown>;
    expect(declineBody.phase).toBe("waiting_for_auction_bids");
    expect(declineBody.pendingAuction).toBeDefined();
  });

  it("settles sealed auction bids and awards the tile", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer } = await createAndStartGame(db);

    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });

    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "decline_tile", tilePosition: 3 },
      db,
    });

    const bidRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "auction_bid", tilePosition: 3, amount: 90 },
      db,
    });
    expect(bidRes.status).toBe(200);
    const bidBody = (await bidRes.json()) as Record<string, unknown>;
    const pendingAuction = bidBody.pendingAuction as Record<string, unknown>;
    expect(pendingAuction.submissionCount).toBe(1);
    expect(pendingAuction.mySubmission).toBe(90);
    expect(pendingAuction.submissions).toEqual({});

    const settleRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "auction_bid", tilePosition: 3, amount: 50 },
      db,
    });
    expect(settleRes.status).toBe(200);
    const settleBody = (await settleRes.json()) as Record<string, unknown>;
    expect(settleBody.phase).toBe("waiting_for_auction_settle");

    const finalized = advanceAuctionSettle(db, gameId);
    expect(finalized.state.phase).toBe("action");
    expect(finalized.state.pendingAuction).toBeUndefined();

    const winner = finalized.state.players.find(
      (player) => player.playerId === currentPlayer,
    )!;
    expect(winner.ownedTilePositions).toContain(3);
  });
});

describe("POST /api/games/:id/action — end_turn", () => {
  it("advances to the next player's turn", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer } = await createAndStartGame(db);

    // Roll to non-purchasable tile (pos 2 = MARKET EVENT, or pos 4 = CORPORATE TAX I)
    // [2, 2] = 4 -> CORPORATE TAX I (special tile, no buy)
    // But [2,2] is doubles! Use [1, 3] = 4 instead
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });

    // End turn
    const endRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes.status).toBe(200);
    const endBody = (await endRes.json()) as Record<string, unknown>;
    expect(endBody.phase).toBe("waiting_for_roll");

    // Now the other player should be able to roll
    const otherRollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [2, 1] },
      db,
    });
    expect(otherRollRes.status).toBe(200);
  });

  it("returns error when trying to end turn during buy decision", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Roll to purchasable tile
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });

    // Try to end turn while buy decision pending
    const endRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes.status).toBe(400);
    const body = (await endRes.json()) as { error: string };
    expect(body.error).toBe("game.cannot_end_turn");
  });
});

describe("POST /api/games/:id/action — rent payment", () => {
  it("charges rent when landing on owned tile", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer, capitals } =
      await createAndStartGame(db);

    // Player 1: Roll to pos 3 (Mobile Gaming Inc.) and buy it
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });
    const endTurnRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    const endTurnBody = (await endTurnRes.json()) as Record<string, unknown>;
    const playersAfterBuy = endTurnBody.players as Array<{
      playerId: string;
      capital: number;
    }>;
    const ownerCapitalBeforeRent = playersAfterBuy.find(
      (p) => p.playerId === currentPlayer,
    )!.capital;

    // Player 2: Roll to same position (pos 3)
    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    expect(rollRes.status).toBe(200);
    const body = (await rollRes.json()) as Record<string, unknown>;

    // Check rent was paid (base rent for Mobile Gaming Inc. is 4)
    const players = body.players as Array<{
      playerId: string;
      capital: number;
    }>;
    const payer = players.find((p) => p.playerId === otherPlayer)!;
    const owner = players.find((p) => p.playerId === currentPlayer)!;

    expect(payer.capital).toBe(capitals[otherPlayer] - 4);
    expect(owner.capital).toBe(ownerCapitalBeforeRent + 4);
  });
});

describe("POST /api/games/:id/action — doubles", () => {
  it("allows rolling again after doubles", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer } = await createAndStartGame(db);

    // Roll doubles [3, 3] = 6 -> pos 6 (Search Engine Corp.)
    const rollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [3, 3] },
      db,
    });
    const rollBody = (await rollRes.json()) as Record<string, unknown>;

    // If landed on purchasable tile, need to buy or decline first
    if (rollBody.phase === "waiting_for_buy") {
      const declineRes = await requestWithEnv(`/api/games/${gameId}/action`, {
        method: "POST",
        headers: { "x-subject": currentPlayer },
        body: {
          type: "decline_tile",
          tilePosition: rollBody.pendingBuyTilePosition,
        },
        db,
      });
      const declineBody = (await declineRes.json()) as Record<string, unknown>;
      expect(declineBody.phase).toBe("waiting_for_auction_bids");
      const auctionTile =
        (
          declineBody.pendingAuction as
            | { tilePosition: number | string }
            | undefined
        )?.tilePosition ?? rollBody.pendingBuyTilePosition;

      await requestWithEnv(`/api/games/${gameId}/action`, {
        method: "POST",
        headers: { "x-subject": currentPlayer },
        body: {
          type: "auction_pass",
          tilePosition: auctionTile,
        },
        db,
      });

      await requestWithEnv(`/api/games/${gameId}/action`, {
        method: "POST",
        headers: { "x-subject": otherPlayer },
        body: {
          type: "auction_pass",
          tilePosition: auctionTile,
        },
        db,
      });

      advanceAuctionSettle(db, gameId);
    }

    // Should be in rolling_doubles phase -> can roll again
    const secondRollRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 1] },
      db,
    });
    expect(secondRollRes.status).toBe(200);
  });
});

describe("POST /api/games/:id/action — special tiles", () => {
  it("pays Corporate Tax I when landing on position 4", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, capitals } = await createAndStartGame(db);

    // [1, 3] = 4 -> CORPORATE TAX I (pays 75 to free market pool)
    const res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    const players = body.players as Array<{
      playerId: string;
      capital: number;
    }>;
    const player = players.find((p) => p.playerId === currentPlayer)!;
    expect(player.capital).toBe(capitals[currentPlayer] - 75);
    expect(body.freeMarketPool).toBe(75);
  });
});

describe("Full game round cycle", () => {
  it("completes a full round with both players taking turns", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, otherPlayer } = await createAndStartGame(db);

    // Player 1 rolls, lands on special tile, ends turn
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    const endRes1 = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes1.status).toBe(200);
    const end1Body = (await endRes1.json()) as Record<string, unknown>;
    expect(end1Body.round).toBe(1);

    // Player 2 rolls, lands on special tile, ends turn
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    const endRes2 = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": otherPlayer },
      body: { type: "end_turn" },
      db,
    });
    expect(endRes2.status).toBe(200);
    const end2Body = (await endRes2.json()) as Record<string, unknown>;
    // After both players go, round should advance
    expect(end2Body.round).toBe(2);
    expect(end2Body.phase).toBe("syndicate_coordination");

    await completeCoordinationPhase(db, gameId, [currentPlayer, otherPlayer]);
    await drawRoundStartMarketEvent(db, gameId, currentPlayer);

    // Player 1 can take their turn again in round 2
    const round2Res = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [2, 1] },
      db,
    });
    expect(round2Res.status).toBe(200);
  });
});

describe("POST /api/games/:id/action — mortgage and redeem", () => {
  it("can mortgage an owned tile during action phase", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, capitals } = await createAndStartGame(db);

    // Roll to pos 3, buy it
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });

    const stateBeforeMortgage = await requestWithEnv(
      `/api/games/${gameId}/state`,
      {
        headers: { "x-subject": currentPlayer },
        db,
      },
    );
    const beforeBody = (await stateBeforeMortgage.json()) as {
      players: Array<{ playerId: string; capital: number }>;
    };
    const capitalBeforeMortgage = beforeBody.players.find(
      (player) => player.playerId === currentPlayer,
    )?.capital;

    // Mortgage the tile (Mobile Gaming Inc. cost 80, mortgage value = 40)
    const mortRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "mortgage_tile", tilePosition: 3 },
      db,
    });
    expect(mortRes.status).toBe(200);
    const body = (await mortRes.json()) as Record<string, unknown>;

    const players = body.players as Array<{
      playerId: string;
      capital: number;
      mortgagedTilePositions: number[];
    }>;
    const player = players.find((p) => p.playerId === currentPlayer)!;
    expect(player.capital).toBe(capitalBeforeMortgage + 40);
    expect(player.mortgagedTilePositions).toContain(3);
  });

  it("can redeem a mortgaged tile", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer, capitals } = await createAndStartGame(db);

    // Roll to pos 3, buy it, mortgage it
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 2] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "buy_tile", tilePosition: 3 },
      db,
    });
    const mortgageRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "mortgage_tile", tilePosition: 3 },
      db,
    });
    const mortgageBody = (await mortgageRes.json()) as Record<string, unknown>;
    const capitalBeforeRedeem = (
      mortgageBody.players as Array<{ playerId: string; capital: number }>
    ).find((p) => p.playerId === currentPlayer)!.capital;

    // Redeem (base cost = ceil(40 * 1.1) = 44; PropTech Pioneer may reduce further)
    const redeemRes = await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "redeem_tile", tilePosition: 3 },
      db,
    });
    expect(redeemRes.status).toBe(200);
    const body = (await redeemRes.json()) as Record<string, unknown>;

    const players = body.players as Array<{
      playerId: string;
      capital: number;
      mortgagedTilePositions: number[];
    }>;
    const player = players.find((p) => p.playerId === currentPlayer)!;
    const redeemCost = capitalBeforeRedeem - player.capital;
    expect(redeemCost).toBeGreaterThan(0);
    expect(redeemCost).toBeLessThanOrEqual(44);
    expect(player.mortgagedTilePositions).not.toContain(3);
  });
});

describe("Game state endpoint reflects action results", () => {
  it("GET /api/games/:id/state returns updated state after actions", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Perform an action
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });

    // Fetch state
    const stateRes = await requestWithEnv(`/api/games/${gameId}/state`, {
      headers: { "x-subject": currentPlayer },
      db,
    });
    expect(stateRes.status).toBe(200);
    const state = (await stateRes.json()) as Record<string, unknown>;
    expect(state.lastDiceRoll).toEqual([1, 3]);
  });
});

describe("Game log tracks all actions", () => {
  it("GET /api/games/:id/log returns entries for submitted actions", async () => {
    const db = createD1Stub();
    const { gameId, currentPlayer } = await createAndStartGame(db);

    // Perform some actions
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "roll_dice", result: [1, 3] },
      db,
    });
    await requestWithEnv(`/api/games/${gameId}/action`, {
      method: "POST",
      headers: { "x-subject": currentPlayer },
      body: { type: "end_turn" },
      db,
    });

    // Check log
    const logRes = await requestWithEnv(`/api/games/${gameId}/log`, {
      headers: { "x-subject": currentPlayer },
      db,
    });
    expect(logRes.status).toBe(200);
    const logBody = (await logRes.json()) as {
      log: Array<{ actionType: string }>;
    };
    expect(logBody.log.length).toBeGreaterThanOrEqual(2);

    const actionTypes = logBody.log.map((e) => e.actionType);
    expect(actionTypes).toContain("game_started");
    expect(actionTypes).toContain("roll_dice");
  });
});
