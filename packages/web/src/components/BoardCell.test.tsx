import type { GameState } from "@oligopoly/validation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardCell } from "./BoardCell";
import {
  setNavigationGameState,
  setNavigationTileDetails,
} from "./setNavigationTestFixtures";

describe("BoardCell set browsing", () => {
  it("updates dialog title and details when selecting another set member, then restores opener focus on close", () => {
    const state = setNavigationGameState();
    const tilesByPosition = new Map(
      (state.tiles ?? []).map((tile) => [String(tile.position), tile]),
    );
    const tileNames = new Map([
      ["1", "Alpha Asset"],
      ["3", "Beta Asset"],
    ]);
    const occupantsByPosition = new Map<
      string,
      NonNullable<GameState["players"]>
    >();

    render(
      <BoardCell
        position={1}
        ownerId={null}
        occupants={[]}
        actorId={null}
        tileNames={tileNames}
        tileDetails={setNavigationTileDetails}
        myPlayerId="me"
        tileState={tilesByPosition.get("1")}
        tilesByPosition={tilesByPosition}
        occupantsByPosition={occupantsByPosition}
        state={state}
        placement={{ edge: "bottom", column: 1, row: 1 }}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /open details for alpha asset/i,
    });
    trigger.focus();
    fireEvent.click(trigger);

    let dialog = screen.getByRole("dialog", { name: /alpha asset/i });
    expect(
      within(dialog).getByText("Position").closest(".tileDetailsMetric"),
    ).toHaveTextContent(/1/);

    fireEvent.click(
      within(dialog).getByRole("button", { name: /beta asset/i }),
    );

    dialog = screen.getByRole("dialog", { name: /beta asset/i });
    expect(
      within(dialog).getByText("Position").closest(".tileDetailsMetric"),
    ).toHaveTextContent(/3/);
    expect(
      within(dialog).getByRole("button", {
        name: /beta asset/i,
        pressed: true,
      }),
    ).toHaveFocus();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      /viewing beta asset/i,
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: /alpha asset/i }),
    );
    dialog = screen.getByRole("dialog", { name: /alpha asset/i });
    expect(
      within(dialog).getByText("Position").closest(".tileDetailsMetric"),
    ).toHaveTextContent(/1/);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
