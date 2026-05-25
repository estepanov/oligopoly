import { describe, expect, it } from "vitest";
import { parseTilePosition } from "../../packages/web/src/lib/boardDisplay";

describe("parseTilePosition", () => {
  it("parses perimeter positions as numbers", () => {
    expect(parseTilePosition("3")).toBe(3);
    expect(parseTilePosition("39")).toBe(39);
  });

  it("keeps diagonal positions as strings", () => {
    expect(parseTilePosition("D1")).toBe("D1");
  });
});
