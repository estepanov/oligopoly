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
