import { LeaderboardWinsEntrySchema } from "@oligopoly/validation";
import { describe, expect, it } from "vitest";
import { safeParseJsonArrayElements } from "../../packages/worker/src/lib/jsonParse";

describe("safeParseJsonArrayElements", () => {
  it("keeps valid rows and drops invalid ones", () => {
    const raw = JSON.stringify([
      { userId: "user-1", username: "alice", wins: 5 },
      { userId: "user-2", username: "no-wins-field" },
      { userId: "user-3", username: "bob", wins: 2 },
    ]);

    expect(safeParseJsonArrayElements(raw, LeaderboardWinsEntrySchema)).toEqual(
      [
        { userId: "user-1", username: "alice", wins: 5 },
        { userId: "user-3", username: "bob", wins: 2 },
      ],
    );
  });

  it("returns empty array on corrupt JSON", () => {
    expect(
      safeParseJsonArrayElements("not-json", LeaderboardWinsEntrySchema),
    ).toEqual([]);
  });

  it("returns empty array when top-level JSON is not an array", () => {
    expect(
      safeParseJsonArrayElements(
        JSON.stringify({ userId: "user-1" }),
        LeaderboardWinsEntrySchema,
      ),
    ).toEqual([]);
    expect(
      safeParseJsonArrayElements(
        JSON.stringify("hello"),
        LeaderboardWinsEntrySchema,
      ),
    ).toEqual([]);
  });

  it("returns empty array for null or missing input", () => {
    expect(
      safeParseJsonArrayElements(null, LeaderboardWinsEntrySchema),
    ).toEqual([]);
    expect(
      safeParseJsonArrayElements(undefined, LeaderboardWinsEntrySchema),
    ).toEqual([]);
  });
});
