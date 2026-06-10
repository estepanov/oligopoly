import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

describe("App", () => {
  it("renders home with app title", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /oligopoly online/i }),
    ).toBeInTheDocument();
  });

  it("renders first-game paths on the home route", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /start your first game/i }),
    ).toHaveAttribute("href", "#first-game-guide-heading");
    expect(
      screen.getByRole("heading", { name: /play with a friend/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /practice solo vs ai/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /set up solo practice/i }),
    ).toHaveAttribute("href", "/lobbies?setup=solo-ai");
    expect(container.querySelector(".homeHeroVisual")).toBeInTheDocument();
    expect(container.querySelectorAll(".statPill")).toHaveLength(3);
  });

  it("navigates to games route", () => {
    render(
      <MemoryRouter initialEntries={["/games"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /^games$/i }),
    ).toBeInTheDocument();
  });

  it("navigates to lobbies route", () => {
    render(
      <MemoryRouter initialEntries={["/lobbies"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /^lobbies$/i }),
    ).toBeInTheDocument();
  });
});
