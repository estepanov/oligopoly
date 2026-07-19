import type { GameState } from "@oligopoly/validation";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardTileDetailsContent } from "./BoardTileDetailsContent";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "g",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["me"],
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
    ],
    tiles: [
      {
        position: 1,
        ownerId: null,
        mortgaged: false,
        developmentTokens: 0,
      },
      {
        position: 3,
        ownerId: null,
        mortgaged: false,
        developmentTokens: 0,
      },
    ],
    ...overrides,
  };
}

const tileDetails = new Map([
  [
    "1",
    {
      position: 1,
      name: "Alpha Asset",
      type: "sector_tile",
      sectorId: "energy",
      cost: 100,
      baseRent: 10,
    },
  ],
  [
    "3",
    {
      position: 3,
      name: "Beta Asset",
      type: "sector_tile",
      sectorId: "energy",
      cost: 120,
      baseRent: 12,
    },
  ],
]);

function renderContent(position: number, onSelectSetMember = vi.fn()) {
  const state = baseState();
  const tilesByPosition = new Map(
    (state.tiles ?? []).map((tile) => [String(tile.position), tile]),
  );
  const occupantsByPosition = new Map<
    string,
    NonNullable<GameState["players"]>
  >();
  return {
    onSelectSetMember,
    ...render(
      <BoardTileDetailsContent
        details={tileDetails.get(String(position))}
        occupants={[]}
        occupantsByPosition={occupantsByPosition}
        ownerId={null}
        position={position}
        state={state}
        tileDetails={tileDetails}
        tileState={tilesByPosition.get(String(position))}
        tilesByPosition={tilesByPosition}
        myPlayerId="me"
        onSelectSetMember={onSelectSetMember}
      />,
    ),
  };
}

describe("BoardTileDetailsContent set navigation", () => {
  it("exposes set members as pressed/unpressed buttons and selects another member", () => {
    const { onSelectSetMember } = renderContent(1);

    const selected = screen.getByRole("button", { name: /alpha asset/i });
    const other = screen.getByRole("button", { name: /beta asset/i });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(other).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(other);
    expect(onSelectSetMember).toHaveBeenCalledWith(3);
    expect(screen.getByRole("status")).toHaveTextContent(/viewing beta asset/i);
  });

  it("does not re-select or re-announce the already selected member", () => {
    const { onSelectSetMember } = renderContent(1);
    const selected = screen.getByRole("button", { name: /alpha asset/i });
    fireEvent.click(selected);
    expect(onSelectSetMember).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
