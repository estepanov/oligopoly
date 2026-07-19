import type { GameState } from "@oligopoly/validation";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  setNavigationGameState,
  setNavigationTileDetails,
} from "../test/fixtures/setNavigationTestFixtures";
import { BoardTileDetailsContent } from "./BoardTileDetailsContent";

function renderContent(
  position: number,
  onSelectSetMember = vi.fn(),
  viewAnnouncement = "",
) {
  const state = setNavigationGameState();
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
        details={setNavigationTileDetails.get(String(position))}
        occupants={[]}
        occupantsByPosition={occupantsByPosition}
        ownerId={null}
        position={position}
        state={state}
        tileDetails={setNavigationTileDetails}
        tileState={tilesByPosition.get(String(position))}
        tilesByPosition={tilesByPosition}
        myPlayerId="me"
        viewAnnouncement={viewAnnouncement}
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
    expect(onSelectSetMember).toHaveBeenCalledWith(3, "Beta Asset");
  });

  it("does not re-select the already selected member", () => {
    const { onSelectSetMember } = renderContent(1);
    const selected = screen.getByRole("button", { name: /alpha asset/i });
    fireEvent.click(selected);
    expect(onSelectSetMember).not.toHaveBeenCalled();
  });

  it("surfaces the view announcement live region", () => {
    renderContent(1, vi.fn(), "Viewing Beta Asset");
    expect(screen.getByRole("status")).toHaveTextContent(/viewing beta asset/i);
  });
});
