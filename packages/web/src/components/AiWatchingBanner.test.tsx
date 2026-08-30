import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiWatchingBanner } from "./AiWatchingBanner";

describe("AiWatchingBanner", () => {
  it("renders Skip while watching", () => {
    const onSkip = vi.fn();

    render(
      <AiWatchingBanner
        open
        name="Nova Blake"
        summary="changed tile ownership"
        onSkip={onSkip}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Watching · Nova Blake",
    );
    expect(screen.getByText("changed tile ownership")).toBeInTheDocument();

    const skipButton = screen.getByRole("button", { name: "Skip" });
    expect(skipButton).toBeEnabled();
    fireEvent.click(skipButton);
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AiWatchingBanner
        open={false}
        name="Nova Blake"
        summary="changed tile ownership"
        onSkip={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
