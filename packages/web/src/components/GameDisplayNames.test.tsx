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
