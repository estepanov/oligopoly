import type { GameState } from "@oligopoly/validation";
import { render, screen, within } from "@testing-library/react";
import { AuctionAffinityActionsPanel } from "./AuctionAffinityActionsPanel";
import { AuctionPanel } from "./AuctionPanel";
import { GameBoardPanel } from "./GameBoardPanel";
import { NegotiationActionsPanel } from "./NegotiationActionsPanel";
import { PlayerSummaryPanel } from "./PlayerSummaryPanel";
import { SyndicateActionsPanel } from "./SyndicateActionsPanel";

const actionState = (): GameState => ({
  gameId: "g",
  round: 1,
  phase: "action",
  currentPlayerIndex: 0,
  turnOrder: ["human-1", "human-2"],
  myAffinityCardId: "consumer_insights",
  players: [
    {
      playerId: "human-1",
      displayName: "Ada",
      position: 0,
      capital: 500,
      ownedTilePositions: [6],
      mortgagedTilePositions: [],
      developmentTokens: {},
      trustworthiness: 7,
      actionPointsRemaining: 2,
      inRegulation: false,
      doublesCount: 0,
      isOnDiagonal: false,
    },
    {
      playerId: "human-2",
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
  tiles: [
    { position: 6, ownerId: "human-1", mortgaged: false, developmentTokens: 0 },
  ],
});

describe("core game display names", () => {
  it("renders display names instead of raw IDs in summary and board panels", () => {
    const state = actionState();
    const tileNames = new Map([
      ["0", "START"],
      ["1", "Digital Content Co."],
      ["6", "Search Engine Corp."],
    ]);

    const { container } = render(
      <>
        <PlayerSummaryPanel
          state={state}
          myPlayerId="human-1"
          tileNames={tileNames}
        />
        <GameBoardPanel
          state={state}
          tileNames={tileNames}
          myPlayerId="human-1"
          actorId="human-2"
        />
      </>,
    );

    expect(screen.getAllByText("Ada (you)")).not.toHaveLength(0);
    expect(screen.getAllByText("Grace")).not.toHaveLength(0);
    expect(container).not.toHaveTextContent("human-2");
  });

  it("groups player assets by matching board set", () => {
    const base = actionState();
    const [adaBase, graceBase] = base.players ?? [];
    if (!adaBase || !graceBase) {
      throw new Error("Expected two base players in test fixture");
    }
    const state: GameState = {
      ...base,
      players: [
        {
          ...adaBase,
          ownedTilePositions: [6, 8, 12],
        },
        graceBase,
      ],
      tiles: [
        {
          position: 6,
          ownerId: "human-1",
          mortgaged: false,
          developmentTokens: 0,
        },
        {
          position: 8,
          ownerId: "human-1",
          mortgaged: false,
          developmentTokens: 0,
        },
        {
          position: 12,
          ownerId: "human-1",
          mortgaged: false,
          developmentTokens: 0,
        },
      ],
    };

    render(
      <PlayerSummaryPanel
        state={state}
        myPlayerId="human-1"
        tileNames={
          new Map([
            ["0", "START"],
            ["6", "Search Engine Corp."],
            ["8", "Social Media Platform"],
            ["12", "OIL PIPELINE"],
          ])
        }
      />,
    );

    const assetList = screen.getByRole("list", {
      name: /ada owned properties grouped by set/i,
    });
    expect(within(assetList).getByText("Big Tech")).toBeInTheDocument();
    expect(within(assetList).getByText(/2 of 3 owned/i)).toBeInTheDocument();
    expect(within(assetList).getByText("Utilities")).toBeInTheDocument();
    expect(within(assetList).getByText(/1 of 2 owned/i)).toBeInTheDocument();
    expect(
      within(assetList).getByText("Search Engine Corp."),
    ).toBeInTheDocument();
    expect(
      within(assetList).getByText("Social Media Platform"),
    ).toBeInTheDocument();
    expect(within(assetList).getByText("OIL PIPELINE")).toBeInTheDocument();
  });

  it("shows current rent and development rent increase on player property cards", () => {
    const base = actionState();
    const [adaBase, graceBase] = base.players ?? [];
    if (!adaBase || !graceBase) {
      throw new Error("Expected two base players in test fixture");
    }
    const state: GameState = {
      ...base,
      players: [
        {
          ...adaBase,
          capital: 500,
          ownedTilePositions: [6, 8, 9],
          actionPointsRemaining: 2,
        },
        graceBase,
      ],
      tiles: [
        {
          position: 6,
          ownerId: "human-1",
          mortgaged: false,
          developmentTokens: 0,
        },
        {
          position: 8,
          ownerId: "human-1",
          mortgaged: false,
          developmentTokens: 0,
        },
        {
          position: 9,
          ownerId: "human-1",
          mortgaged: false,
          developmentTokens: 0,
        },
      ],
    };

    render(
      <PlayerSummaryPanel
        state={state}
        myPlayerId="human-1"
        tileNames={
          new Map([
            ["0", "START"],
            ["6", "Search Engine Corp."],
            ["8", "Social Media Platform"],
            ["9", "Cloud Infrastructure"],
          ])
        }
      />,
    );

    const propertyCard = screen.getByText("Search Engine Corp.").closest("li");
    expect(propertyCard).not.toBeNull();
    expect(
      within(propertyCard as HTMLElement).getByText("Rent"),
    ).toBeInTheDocument();
    expect(
      within(propertyCard as HTMLElement).getByText("$20"),
    ).toBeInTheDocument();
    expect(
      within(propertyCard as HTMLElement).getByText("+$30 rent"),
    ).toBeInTheDocument();
    expect(
      within(propertyCard as HTMLElement).getByText("$140"),
    ).toBeInTheDocument();
  });

  it("marks owned cards when a syndicate completes the set", () => {
    const base = actionState();
    const [adaBase, graceBase] = base.players ?? [];
    if (!adaBase || !graceBase) {
      throw new Error("Expected two base players in test fixture");
    }
    const state: GameState = {
      ...base,
      players: [
        {
          ...adaBase,
          ownedTilePositions: [6],
          syndicateId: "syndicate-g-1",
        },
        {
          ...graceBase,
          ownedTilePositions: [8, 9],
          syndicateId: "syndicate-g-1",
        },
      ],
      syndicates: {
        "syndicate-g-1": {
          syndicateId: "syndicate-g-1",
          adminId: "human-1",
          memberIds: ["human-1", "human-2"],
        },
      },
      tiles: [
        {
          position: 6,
          ownerId: "human-1",
          mortgaged: false,
          developmentTokens: 0,
        },
        {
          position: 8,
          ownerId: "human-2",
          mortgaged: false,
          developmentTokens: 0,
        },
        {
          position: 9,
          ownerId: "human-2",
          mortgaged: false,
          developmentTokens: 0,
        },
      ],
    };

    render(
      <PlayerSummaryPanel
        state={state}
        myPlayerId="human-1"
        tileNames={
          new Map([
            ["0", "START"],
            ["6", "Search Engine Corp."],
            ["8", "Social Media Platform"],
            ["9", "Cloud Infrastructure"],
          ])
        }
      />,
    );

    const assetList = screen.getByRole("list", {
      name: /ada owned properties grouped by set/i,
    });
    const propertyCard = within(assetList)
      .getByText("Search Engine Corp.")
      .closest("li");
    expect(propertyCard).not.toBeNull();
    expect(
      within(propertyCard as HTMLElement).getByText("Syndicate set available"),
    ).toBeInTheDocument();
  });

  it("renders compact board context with player display names", () => {
    const base = actionState();
    const [adaBase, graceBase] = base.players ?? [];
    if (!adaBase || !graceBase) {
      throw new Error("Expected two base players in test fixture");
    }
    const state: GameState = {
      ...base,
      players: [
        {
          ...adaBase,
          playerId: "human-1",
          displayName: "Ada",
          capital: 500,
          ownedTilePositions: [6],
          syndicateId: "syndicate-g-1",
        },
        {
          ...graceBase,
          playerId: "human-2",
          displayName: "Grace",
          capital: 300,
          ownedTilePositions: [8],
          syndicateId: "syndicate-g-1",
        },
      ],
      syndicates: {
        "syndicate-g-1": {
          syndicateId: "syndicate-g-1",
          adminId: "human-1",
          memberIds: ["human-1", "human-2"],
        },
      },
    };

    render(
      <GameBoardPanel
        state={state}
        tileNames={
          new Map([
            ["0", "START"],
            ["1", "Digital Content Co."],
            ["6", "Search Engine Corp."],
            ["8", "Social Media Platform"],
          ])
        }
        myPlayerId="human-1"
        actorId="human-2"
      />,
    );

    expect(screen.getByText("You are on")).toBeInTheDocument();
    expect(screen.getAllByText("START").length).toBeGreaterThan(0);
    expect(screen.getByText("Your capital")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("Owned tiles")).toBeInTheDocument();
    expect(screen.getByText(/active player:/i)).toBeInTheDocument();
    const positions = screen.getByRole("list", { name: /player positions/i });
    expect(within(positions).getByText("You")).toBeInTheDocument();
    expect(within(positions).getByText("Grace")).toBeInTheDocument();
    expect(
      within(positions).getByText("Digital Content Co."),
    ).toBeInTheDocument();
  });

  it("renders display names in auction, negotiation, affinity, and syndicate controls", () => {
    const tileNames = new Map([["6", "Search Engine Corp."]]);
    const base = actionState();
    const noop = async () => undefined;

    const { container } = render(
      <>
        <AuctionPanel
          state={{
            ...base,
            phase: "waiting_for_auction_bids",
            settings: { currencySymbol: "¤", currencyMultiplier: "10" },
            pendingAuction: {
              tilePosition: 6,
              trigger: "player_initiated",
              auctionType: "open_bids",
              submissions: { "human-2": 90 },
              eligiblePlayerIds: ["human-1", "human-2"],
              resumePhase: "action",
            },
          }}
          myPlayerId="human-1"
          tileNames={tileNames}
          busy={false}
          onAction={noop}
        />
        <NegotiationActionsPanel
          state={base}
          myPlayerId="human-1"
          tileNames={tileNames}
          busy={false}
          onAction={noop}
        />
        <AuctionAffinityActionsPanel
          state={base}
          myPlayerId="human-1"
          tileNames={tileNames}
          busy={false}
          onAction={noop}
        />
        <SyndicateActionsPanel
          state={base}
          myPlayerId="human-1"
          busy={false}
          onAction={noop}
        />
      </>,
    );

    expect(screen.getByText("Grace: ¤900")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText(/negotiate with/i)).getByRole("option", {
        name: "Grace",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText(/reveal capital of/i)).getByRole("option", {
        name: "Grace",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Grace")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("human-2");
  });
});
