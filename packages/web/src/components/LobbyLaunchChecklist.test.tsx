import type { LobbyResponse } from "@oligopoly/validation";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LobbyLaunchChecklist } from "./LobbyLaunchChecklist";

function baseLobby(overrides: Partial<LobbyResponse> = {}): LobbyResponse {
  return {
    id: "lobby-1",
    name: "First Table",
    hostId: "host",
    status: "waiting",
    maxPlayers: 4,
    isPrivate: true,
    optionalRuleIds: [],
    createdAt: 1,
    players: [
      { userId: "host", isAdmin: true, joinedAt: 1, isReady: true },
      { userId: "guest", isAdmin: false, joinedAt: 2, isReady: false },
    ],
    aiSlots: [],
    ...overrides,
  };
}

describe("LobbyLaunchChecklist", () => {
  it("does not mark host start complete until the canonical start gate passes", () => {
    render(
      <LobbyLaunchChecklist
        lobby={baseLobby()}
        isAdmin={true}
        isMember={true}
        signedIn={true}
      />,
    );

    const item = screen.getByLabelText(/Host starts the game: incomplete/i);

    expect(within(item).getByText("Host starts the game")).toBeInTheDocument();
    expect(within(item).getByText("Incomplete")).toBeInTheDocument();
  });

  it("marks host start complete when all humans are ready and seat count is valid", () => {
    render(
      <LobbyLaunchChecklist
        lobby={baseLobby({
          players: [
            { userId: "host", isAdmin: true, joinedAt: 1, isReady: true },
            { userId: "guest", isAdmin: false, joinedAt: 2, isReady: true },
          ],
        })}
        isAdmin={true}
        isMember={true}
        signedIn={true}
      />,
    );

    const item = screen.getByLabelText(/Host starts the game: complete/i);

    expect(within(item).getByText("Host starts the game")).toBeInTheDocument();
    expect(within(item).getByText("Complete")).toBeInTheDocument();
  });

  it("exposes checklist state to assistive technology for every item", () => {
    render(
      <LobbyLaunchChecklist
        lobby={baseLobby()}
        isAdmin={true}
        isMember={true}
        signedIn={true}
      />,
    );

    expect(screen.getAllByLabelText(/complete|incomplete/i)).toHaveLength(4);
  });
});
