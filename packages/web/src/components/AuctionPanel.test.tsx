import type { GameState } from "@oligopoly/validation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuctionPanel } from "./AuctionPanel";

const tileNames = new Map([["6", "Search Engine Corp."]]);

function auctionState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "g",
    round: 1,
    phase: "waiting_for_auction_bids",
    currentPlayerIndex: 1,
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
        capital: 40,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 0,
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
    pendingAuction: {
      tilePosition: 6,
      trigger: "decline",
      auctionType: "sealed_bids",
      submissions: {},
      eligiblePlayerIds: ["me", "opponent"],
      tieBreakMinBid: 25,
      resumePhase: "action",
      submissionCount: 0,
    },
    ...overrides,
  };
}

describe("AuctionPanel", () => {
  it("initializes the bid input to the minimum bid", () => {
    render(
      <AuctionPanel
        state={auctionState()}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/bid amount/i)).toHaveValue(25);
    expect(screen.getByText("Minimum bid")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
    expect(screen.getByText("Your cash")).toBeInTheDocument();
    expect(screen.getByText("$40")).toBeInTheDocument();
  });

  it("blocks submitting bids above available cash", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);

    render(
      <AuctionPanel
        state={auctionState()}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={onAction}
      />,
    );

    fireEvent.change(screen.getByLabelText(/bid amount/i), {
      target: { value: "50" },
    });

    expect(
      screen.getByText(/you do not have enough capital/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit bid/i })).toBeDisabled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("submits valid bids", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);

    render(
      <AuctionPanel
        state={auctionState()}
        myPlayerId="me"
        tileNames={tileNames}
        busy={false}
        onAction={onAction}
      />,
    );

    fireEvent.change(screen.getByLabelText(/bid amount/i), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit bid/i }));

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith("Bid $30 on Search Engine Corp.", {
        type: "auction_bid",
        tilePosition: 6,
        amount: 30,
      });
    });
  });
});
