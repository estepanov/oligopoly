import {
  isOptionalRuleEnabled,
  regulationPenaltiesEnabled,
} from "@oligopoly/shared";
import { describe, expect, it } from "vitest";

describe("optionalRulesEngine", () => {
  it("detects enabled optional rules", () => {
    expect(
      isOptionalRuleEnabled(
        { optionalRuleIds: ["no_regulation", "speed_market"] },
        "no_regulation",
      ),
    ).toBe(true);
    expect(
      isOptionalRuleEnabled(
        { optionalRuleIds: ["speed_market"] },
        "no_regulation",
      ),
    ).toBe(false);
  });

  it("disables regulation penalties when no_regulation is active", () => {
    expect(
      regulationPenaltiesEnabled({ optionalRuleIds: ["no_regulation"] }),
    ).toBe(false);
    expect(regulationPenaltiesEnabled({ optionalRuleIds: [] })).toBe(true);
  });
});
