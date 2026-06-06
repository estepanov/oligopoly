import { fireEvent, render, screen, within } from "@testing-library/react";
import { InfoDialog } from "./InfoDialog";

describe("InfoDialog", () => {
  it("traps keyboard focus while open and restores focus on close", () => {
    render(
      <div>
        <button type="button">Before</button>
        <InfoDialog title="Tile details" triggerLabel="Explain tile">
          <button type="button">Inside action</button>
        </InfoDialog>
        <button type="button">After</button>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: /explain tile/i });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: /tile details/i });
    const close = within(dialog).getByRole("button", {
      name: /close tile details/i,
    });
    const inside = screen.getByRole("button", { name: /inside action/i });
    expect(close).toHaveFocus();

    inside.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(inside).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
