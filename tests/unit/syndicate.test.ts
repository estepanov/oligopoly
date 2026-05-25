import {
  findSyndicateWinnerId,
  syndicateMarketValue,
  tileOwnedByController,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("syndicate helpers", () => {
  const baseState = {
    syndicates: {
      s1: {
        syndicateId: "s1",
        adminId: "player-1",
        memberIds: ["player-1", "player-2"],
      },
    },
    players: [
      { playerId: "player-1", syndicateId: "s1" },
      { playerId: "player-2", syndicateId: "s1" },
      { playerId: "player-3", syndicateId: null },
    ],
    tiles: [
      { position: 3, ownerId: "player-1", mortgaged: false },
      { position: 6, ownerId: "player-2", mortgaged: false },
      { position: 14, ownerId: "player-3", mortgaged: false },
    ],
  };

  it("treats syndicate mates as shared controllers", () => {
    expect(tileOwnedByController(baseState, "player-1", "player-2")).toBe(true);
    expect(tileOwnedByController(baseState, "player-3", "player-1")).toBe(
      false,
    );
  });

  it("sums syndicate market value across members", () => {
    expect(syndicateMarketValue(baseState, ["player-1", "player-2"])).toBe(220);
  });

  it("detects syndicate win threshold", () => {
    const winner = findSyndicateWinnerId(baseState, 200);
    expect(winner).toBe("player-1");
  });
});
