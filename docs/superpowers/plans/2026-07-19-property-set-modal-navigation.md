# Property Set Modal Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players browse full tile details for every member of a set inside the existing board-tile `InfoDialog`, with keyboard-accessible buttons, updating title, live announcement, and single-dialog close back to the opener cell.

**Architecture:** `BoardCell` owns `viewedPosition` and passes resolved viewed-tile props into `BoardTileDetailsContent`. Set membership rows become buttons that call `onSelectSetMember`. `InfoDialog` gains an `onOpenChange` lifecycle callback so `viewedPosition` resets when the dialog opens/closes. Title is already a live React prop—no frozen title.

**Tech Stack:** React 19, Vitest, Testing Library (`@testing-library/react`), existing `InfoDialog` / board details components in `@oligopoly/web`.

## Global Constraints

- Full detail swap for the viewed tile (hero, metrics, rent, economics, occupants, set selection).
- Set members are buttons; Tab + Enter/Space select (not arrow-key listbox).
- Dialog title always matches the currently viewed tile.
- After select: focus stays on the activated set-member button; polite `aria-live` announces `Viewing {tile name}`.
- Re-selecting the current member is a no-op (no live announcement).
- Close restores focus to the **opener board cell** trigger (existing `InfoDialog` behavior).
- No worker/shared/API or game-rules doc changes.
- Prefer extending existing components/tests; YAGNI—no nested dialogs.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/web/src/components/InfoDialog.tsx` | Optional `onOpenChange?(open: boolean)` when open state changes |
| `packages/web/src/components/InfoDialog.test.tsx` | Cover `onOpenChange` + existing focus trap |
| `packages/web/src/components/BoardTileDetailsContent.tsx` | Set-member buttons, `onSelectSetMember`, live region |
| `packages/web/src/components/BoardTileDetailsContent.test.tsx` | Create: set navigation + a11y + announcement tests |
| `packages/web/src/components/BoardCell.tsx` | `viewedPosition` state, dynamic title, resolve viewed props, wire callbacks |
| `packages/web/src/components/BoardCell.test.tsx` | Create: open → browse → return → close focus restore |
| `packages/web/src/styles/pages/app-pages.css` | Button-friendly `.boardSetItem` styles |

---

### Task 1: `InfoDialog` open lifecycle callback

**Files:**
- Modify: `packages/web/src/components/InfoDialog.tsx`
- Modify: `packages/web/src/components/InfoDialog.test.tsx`

**Interfaces:**
- Consumes: existing `InfoDialog` props
- Produces: `onOpenChange?: (open: boolean) => void` invoked whenever dialog open state becomes `true` or `false`

- [ ] **Step 1: Write the failing test**

Add to `InfoDialog.test.tsx`:

```tsx
it("notifies onOpenChange when opened and closed", () => {
  const onOpenChange = vi.fn();
  render(
    <InfoDialog
      title="Tile details"
      triggerLabel="Explain tile"
      onOpenChange={onOpenChange}
    >
      <p>Body</p>
    </InfoDialog>,
  );

  fireEvent.click(screen.getByRole("button", { name: /explain tile/i }));
  expect(onOpenChange).toHaveBeenCalledWith(true);

  fireEvent.keyDown(window, { key: "Escape" });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
```

Add `import { vi } from "vitest";` if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oligopoly/web exec vitest run src/components/InfoDialog.test.tsx`

Expected: FAIL — `onOpenChange` is not a valid prop / not called.

- [ ] **Step 3: Implement `onOpenChange`**

In `InfoDialog.tsx`:

1. Add `onOpenChange?: (open: boolean) => void` to `InfoDialogProps`.
2. Destructure it (default unused).
3. Add effect:

```tsx
useEffect(() => {
  onOpenChange?.(open);
}, [open, onOpenChange]);
```

Keep all existing open/close paths (`setOpen`) unchanged—they already flip `open`, so the effect covers open, Escape, Close button, and backdrop dismiss.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oligopoly/web exec vitest run src/components/InfoDialog.test.tsx`

Expected: PASS (including existing focus-trap test).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/InfoDialog.tsx packages/web/src/components/InfoDialog.test.tsx
git commit -m "feat(web): notify InfoDialog consumers on open change"
```

---

### Task 2: Interactive set membership in `BoardTileDetailsContent`

**Files:**
- Create: `packages/web/src/components/BoardTileDetailsContent.test.tsx`
- Modify: `packages/web/src/components/BoardTileDetailsContent.tsx`
- Modify: `packages/web/src/styles/pages/app-pages.css` (button styles for `.boardSetItem`)

**Interfaces:**
- Consumes: existing content props (`position`, `details`, maps, `state`, …)
- Produces: optional `onSelectSetMember?: (position: number | string) => void`
  - When provided and set has multiple members, each member renders as `<button type="button">`
  - `aria-pressed={member.selected}`
  - Clicking a non-selected member calls `onSelectSetMember(member.position)` and updates a polite live region to `Viewing {member.label}`
  - Clicking the selected member does nothing (no callback, no announcement change)

- [ ] **Step 1: Write the failing tests**

Create `BoardTileDetailsContent.test.tsx` with a minimal two-tile sector fixture:

```tsx
import type { GameState } from "@oligopoly/validation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardTileDetailsContent } from "./BoardTileDetailsContent";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "g",
    round: 1,
    phase: "waiting_for_roll",
    currentPlayerIndex: 0,
    turnOrder: ["me"],
    freeMarketPool: 0,
    pendingBuyTilePosition: null,
    lastDiceRoll: null,
    winnerId: null,
    eliminatedPlayerIds: [],
    myAffinityCardId: null,
    players: [
      {
        playerId: "me",
        displayName: "Ada",
        position: 0,
        capital: 500,
        ownedTilePositions: [],
        mortgagedTilePositions: [],
        developmentTokens: {},
        trustworthiness: 7,
        actionPointsRemaining: 2,
        inRegulation: false,
        doublesCount: 0,
        isOnDiagonal: false,
      },
    ],
    tiles: [
      {
        position: 1,
        ownerId: null,
        mortgaged: false,
        developmentTokens: 0,
      },
      {
        position: 3,
        ownerId: null,
        mortgaged: false,
        developmentTokens: 0,
      },
    ],
    ...overrides,
  };
}

const tileDetails = new Map([
  [
    "1",
    {
      position: 1,
      name: "Alpha Asset",
      type: "sector_tile",
      sectorId: "energy",
      cost: 100,
      baseRent: 10,
    },
  ],
  [
    "3",
    {
      position: 3,
      name: "Beta Asset",
      type: "sector_tile",
      sectorId: "energy",
      cost: 120,
      baseRent: 12,
    },
  ],
]);

function renderContent(
  position: number,
  onSelectSetMember = vi.fn(),
) {
  const state = baseState();
  const tilesByPosition = new Map(
    (state.tiles ?? []).map((tile) => [String(tile.position), tile]),
  );
  const occupantsByPosition = new Map<string, NonNullable<GameState["players"]>>();
  return {
    onSelectSetMember,
    ...render(
      <BoardTileDetailsContent
        details={tileDetails.get(String(position))}
        occupants={[]}
        occupantsByPosition={occupantsByPosition}
        ownerId={null}
        position={position}
        state={state}
        tileDetails={tileDetails}
        tileState={tilesByPosition.get(String(position))}
        tilesByPosition={tilesByPosition}
        myPlayerId="me"
        onSelectSetMember={onSelectSetMember}
      />,
    ),
  };
}

describe("BoardTileDetailsContent set navigation", () => {
  it("exposes set members as pressed/unpressed buttons and selects another member", () => {
    const { onSelectSetMember } = renderContent(1);

    const selected = screen.getByRole("button", { name: /alpha asset/i });
    const other = screen.getByRole("button", { name: /beta asset/i });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(other).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(other);
    expect(onSelectSetMember).toHaveBeenCalledWith(3);
    expect(screen.getByRole("status")).toHaveTextContent(/viewing beta asset/i);
  });

  it("does not re-select or re-announce the already selected member", () => {
    const { onSelectSetMember } = renderContent(1);
    const selected = screen.getByRole("button", { name: /alpha asset/i });
    fireEvent.click(selected);
    expect(onSelectSetMember).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
```

Adjust tile field shapes if TypeScript complains—match whatever `GameState["tiles"][number]` and `BoardTileDetails` require in this repo (mirror `GamePlayControls.test.tsx` / real tile objects).

Accessible name: ensure the button’s accessible name includes the tile label (from visible text inside the button is fine).

Live region: use `role="status"` (implicit polite live) or `aria-live="polite"` with an accessible name; tests above assume `getByRole("status")`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @oligopoly/web exec vitest run src/components/BoardTileDetailsContent.test.tsx`

Expected: FAIL — `onSelectSetMember` unknown / no buttons in set list.

- [ ] **Step 3: Implement interactive set list + live region**

In `BoardTileDetailsContent.tsx`:

1. Extend props:

```tsx
onSelectSetMember?: (position: number | string) => void;
```

2. Add state for announcement:

```tsx
const [viewAnnouncement, setViewAnnouncement] = useState("");
```

Import `useState` from React.

3. Replace each set-member `<li>` content with a button when `onSelectSetMember` is defined. Preferred structure:

```tsx
<ul className="boardSetList">
  {setInfo.members.map((member) => {
    const selected = member.selected;
    const className = [
      "boardSetItem",
      selected ? "boardSetItemSelected" : "",
      member.mortgaged ? "boardSetItemMortgaged" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const body = (
      <>
        <span className="boardSetPosition">{member.position}</span>
        <span className="boardSetMain">
          <strong>{member.label}</strong>
          <span>
            Owned by {member.ownerLabel}
            {member.occupantLabel
              ? ` | Players here: ${member.occupantLabel}`
              : ""}
          </span>
        </span>
        <span className="boardSetStatus">
          {selected ? "Selected" : member.statusLabel}
        </span>
      </>
    );

    return (
      <li key={String(member.position)}>
        {onSelectSetMember ? (
          <button
            type="button"
            className={className}
            aria-pressed={selected}
            onClick={() => {
              if (selected) return;
              setViewAnnouncement(`Viewing ${member.label}`);
              onSelectSetMember(member.position);
            }}
          >
            {body}
          </button>
        ) : (
          <div className={className}>{body}</div>
        )}
      </li>
    );
  })}
</ul>
```

4. Add live region near the top of the surface (or just above the set section):

```tsx
<div className="visuallyHidden" role="status" aria-live="polite">
  {viewAnnouncement}
</div>
```

If `.visuallyHidden` does not exist in the stylesheet, add:

```css
.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

5. Update `.boardSetItem` (and selected/mortgaged) so it works as a full-width button:

```css
button.boardSetItem {
  width: 100%;
  margin: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
```

Keep existing grid layout on `.boardSetItem`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @oligopoly/web exec vitest run src/components/BoardTileDetailsContent.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/BoardTileDetailsContent.tsx packages/web/src/components/BoardTileDetailsContent.test.tsx packages/web/src/styles/pages/app-pages.css
git commit -m "feat(web): make set membership tiles selectable in details"
```

---

### Task 3: Wire `viewedPosition` in `BoardCell`

**Files:**
- Modify: `packages/web/src/components/BoardCell.tsx`
- Create: `packages/web/src/components/BoardCell.test.tsx`

**Interfaces:**
- Consumes: `InfoDialog.onOpenChange`, `BoardTileDetailsContent.onSelectSetMember`
- Produces: browsing behavior end-to-end from a board cell trigger

- [ ] **Step 1: Write the failing integration test**

Create `BoardCell.test.tsx` that renders one `BoardCell` with a two-member sector and a real `BoardPlacement` (perimeter edge is enough):

```tsx
import type { GameState } from "@oligopoly/validation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardCell } from "./BoardCell";

// Reuse the same minimal state + tileDetails maps as Task 2 tests
// (copy the fixture helpers into this file — do not import from the other test file).

describe("BoardCell set browsing", () => {
  it("updates dialog title and details when selecting another set member, then restores opener focus on close", () => {
    const state = baseState();
    const tilesByPosition = new Map(
      (state.tiles ?? []).map((tile) => [String(tile.position), tile]),
    );
    const tileNames = new Map([
      ["1", "Alpha Asset"],
      ["3", "Beta Asset"],
    ]);
    const occupantsByPosition = new Map();

    render(
      <BoardCell
        position={1}
        ownerId={null}
        occupants={[]}
        actorId={null}
        tileNames={tileNames}
        tileDetails={tileDetails}
        myPlayerId="me"
        tileState={tilesByPosition.get("1")}
        tilesByPosition={tilesByPosition}
        occupantsByPosition={occupantsByPosition}
        state={state}
        placement={{ edge: "bottom", column: 1, row: 1 }}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /open details for alpha asset/i,
    });
    trigger.focus();
    fireEvent.click(trigger);

    let dialog = screen.getByRole("dialog", { name: /alpha asset/i });
    expect(
      within(dialog).getByText("Position").closest(".tileDetailsMetric"),
    ).toHaveTextContent(/1/);

    fireEvent.click(
      within(dialog).getByRole("button", { name: /beta asset/i }),
    );

    dialog = screen.getByRole("dialog", { name: /beta asset/i });
    expect(
      within(dialog).getByText("Position").closest(".tileDetailsMetric"),
    ).toHaveTextContent(/3/);
    expect(
      within(dialog).getByRole("button", { name: /beta asset/i }),
    ).toHaveFocus();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      /viewing beta asset/i,
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: /alpha asset/i }),
    );
    dialog = screen.getByRole("dialog", { name: /alpha asset/i });
    expect(
      within(dialog).getByText("Position").closest(".tileDetailsMetric"),
    ).toHaveTextContent(/1/);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
```

If `BoardPlacement` requires more fields, open `packages/web/src/lib/boardViewModel.ts` and satisfy the type with the minimal valid perimeter placement used by `BoardGrid`.

If the Position metric assertion is brittle, assert via the hero `#` strong text (`within(dialog).getByText("#3")`) instead—match whatever the UI renders for the viewed tile.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oligopoly/web exec vitest run src/components/BoardCell.test.tsx`

Expected: FAIL — set members not buttons / title does not change.

- [ ] **Step 3: Implement `BoardCell` viewed state**

In `BoardCell.tsx`:

1. Import `useState`.
2. Add:

```tsx
const [viewedPosition, setViewedPosition] = useState(position);
```

3. Resolve viewed tile (with fallback):

```tsx
const viewedKey = String(viewedPosition);
const effectivePosition = tileDetails.has(viewedKey) ? viewedPosition : position;
const viewedDetails = tileDetails.get(String(effectivePosition));
const viewedTileState = tilesByPosition.get(String(effectivePosition));
const viewedOwnerId = viewedTileState?.ownerId ?? null;
const viewedOccupants =
  occupantsByPosition.get(String(effectivePosition)) ?? [];
const viewedLabel = tileLabel(effectivePosition, tileNames);
```

4. Wire `InfoDialog`:

```tsx
<InfoDialog
  title={viewedLabel}
  triggerLabel={`Open details for ${label}`}
  onOpenChange={(open) => {
    if (open) {
      setViewedPosition(position);
    } else {
      setViewedPosition(position);
    }
  }}
  /* existing triggerClassName / style / content unchanged — still use opener cell visuals */
>
  <BoardTileDetailsContent
    details={viewedDetails}
    occupants={viewedOccupants}
    occupantsByPosition={occupantsByPosition}
    ownerId={viewedOwnerId}
    position={effectivePosition}
    state={state}
    tileDetails={tileDetails}
    tileState={viewedTileState}
    tilesByPosition={tilesByPosition}
    myPlayerId={myPlayerId}
    onSelectSetMember={setViewedPosition}
  />
</InfoDialog>
```

Notes:
- Trigger chrome (name, status, classes) stays based on the **cell’s own** `position` / `ownerId` / `tileState`—only dialog title + body follow `viewedPosition`.
- `onOpenChange` always resets to the opener `position` so reopen starts clean whether opening or closing.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @oligopoly/web exec vitest run src/components/BoardCell.test.tsx src/components/BoardTileDetailsContent.test.tsx src/components/InfoDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/BoardCell.tsx packages/web/src/components/BoardCell.test.tsx
git commit -m "feat(web): browse set mates inside board tile details dialog"
```

---

### Task 4: Verification + planning-doc note

**Files:**
- Possibly none (verification only)
- If behavior needs a one-line pointer in `oligopoly_technical_plan.md` BoardGrid UI notes, add a short sentence that set membership in the tile details dialog is interactive—only if the plan already documents the static list; otherwise skip (spec says no rules/plan changes expected).

- [ ] **Step 1: Run web tests and typecheck**

```bash
pnpm --filter @oligopoly/web test
pnpm run typecheck
```

Expected: all pass.

- [ ] **Step 2: Manual smoke (optional but recommended)**

```bash
pnpm run dev
```

Open a game board → open a sector tile → Tab to set members → activate another → confirm title/body swap → activate original → Escape → focus returns to the cell.

- [ ] **Step 3: Final commit only if docs changed**

If no doc edits, skip. Otherwise:

```bash
git add oligopoly_technical_plan.md
git commit -m "docs: note interactive set membership in tile details"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Full content swap for viewed tile | Task 3 |
| Set members are Tab-able buttons | Task 2 |
| Dialog title follows viewed tile | Task 3 |
| Focus stays on activated set button | Task 2/3 tests |
| Polite live announcement | Task 2 |
| Re-select no-op | Task 2 |
| Switch back to original | Task 3 |
| Close restores opener trigger focus | Task 3 (existing InfoDialog) |
| Reset viewed tile on reopen | Task 1 + Task 3 `onOpenChange` |
| Utilities/hubs (same set UI path) | Task 2/3 — same `buildTileSetInfo` + buttons |
| No API/engine changes | All tasks web-only |

## Self-review notes

- No TBD/placeholder steps.
- `onSelectSetMember` / `onOpenChange` / `viewedPosition` naming is consistent across tasks.
- Title updates via React props already supported by `InfoDialog` (`{title}` in header)—no frozen-title bug.
- CSS changes are limited to making `.boardSetItem` a valid button.
