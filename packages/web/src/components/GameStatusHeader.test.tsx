import type { GameState } from "@oligopoly/validation";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GameStatusHeader } from "./GameStatusHeader";

function baseGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "game-1",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["me", "opponent"],
    freeMarketPool: 0,
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    myAffinityCardId: null,
    players: [
      {
        playerId: "me",
        displayName: "Ada",
        position: 0,
        capital: 500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
      {
        playerId: "opponent",
        displayName: "Grace",
        position: 1,
        capital: 500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 0,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    tiles: [],
    ...overrides,
  };
}

function renderHeader(props: {
  state: GameState | null;
  actorId?: string | null;
  myPlayerId?: string | null;
  myTurn?: boolean;
  turnDeadline?: number | null;
  timerKind?: string | null;
}) {
  return render(
    <MemoryRouter>
      <GameStatusHeader
        gameId="game-1"
        state={props.state}
        actorId={props.actorId ?? "me"}
        myPlayerId={props.myPlayerId ?? "me"}
        myTurn={props.myTurn ?? true}
        wsStatus="connected"
        turnDeadline={props.turnDeadline ?? null}
        timerKind={props.timerKind ?? null}
      />
    </MemoryRouter>,
  );
}

describe("GameStatusHeader", () => {
  it("shows loading state before table data arrives", () => {
    renderHeader({ state: null, actorId: null, myTurn: false });

    expect(
      screen.getByRole("heading", { name: "Loading table" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("foregrounds the viewer's turn", () => {
    renderHeader({ state: baseGameState(), actorId: "me", myTurn: true });

    expect(
      screen.getByRole("heading", { name: "Your turn: Roll to move" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your turn")).toBeInTheDocument();
  });

  it("shows waiting state for non-auction turns", () => {
    renderHeader({
      state: baseGameState({ currentPlayerIndex: 1 }),
      actorId: "opponent",
      myTurn: false,
    });

    expect(
      screen.getByRole("heading", { name: "Waiting for Grace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("prompts eligible auction bidders even when they are not the turn actor", () => {
    renderHeader({
      state: baseGameState({
        phase: "waiting_for_auction_bids",
        currentPlayerIndex: 1,
        pendingAuction: {
          tilePosition: 6,
          trigger: "decline",
          auctionType: "sealed_bids",
          submissions: {},
          eligiblePlayerIds: ["me", "opponent"],
          resumePhase: "action",
        },
      }),
      actorId: "opponent",
      myTurn: false,
      timerKind: "auction_bids",
      turnDeadline: Date.UTC(2026, 0, 1, 12),
    });

    expect(
      screen.getByRole("heading", {
        name: "Sealed auction: Decide your bid",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Auction bidding")).toBeInTheDocument();
    expect(screen.getByText(/Auction closes/i)).toBeInTheDocument();
  });

  it("labels auction settle separately from bidding", () => {
    renderHeader({
      state: baseGameState({
        phase: "waiting_for_auction_settle",
        pendingAuction: {
          tilePosition: 6,
          trigger: "decline",
          auctionType: "sealed_bids",
          submissions: { me: 20 },
          eligiblePlayerIds: ["me", "opponent"],
          resumePhase: "action",
        },
      }),
      actorId: "opponent",
      myTurn: false,
      timerKind: "auction_settle",
      turnDeadline: Date.UTC(2026, 0, 1, 12),
    });

    expect(
      screen.getByRole("heading", {
        name: "Auction reveal: Waiting for auction results",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Auction settling")).toBeInTheDocument();
    expect(screen.getByText(/Auction reveals/i)).toBeInTheDocument();
  });
});
