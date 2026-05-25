import { DISRUPTION_DECK, DISRUPTION_DECK_IDS } from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("DISRUPTION_DECK config", () => {
  it("includes effect descriptions for every card", () => {
    for (const cardId of DISRUPTION_DECK_IDS) {
      const card = DISRUPTION_DECK[cardId];
      expect(card.description.length).toBeGreaterThan(0);
    }
  });

  it("matches Corporate Espionage resolution semantics", () => {
    expect(
      DISRUPTION_DECK.disruption_corporate_espionage.description,
    ).toContain("opponents");
  });
});
