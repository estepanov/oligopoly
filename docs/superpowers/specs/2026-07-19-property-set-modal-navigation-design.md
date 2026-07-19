# Property set modal navigation — design

## Goal

When a player opens a board tile’s details dialog, the Set membership list should let them browse other tiles in the same set inside that same dialog—updating full details and the dialog title—then return to any member (including the originally opened tile) and close once, in an accessible way.

## Current behavior

- `BoardCell` wraps each tile in `InfoDialog` with body `BoardTileDetailsContent`.
- Set membership (from `buildTileSetInfo`) is a static list: the current tile is visually “Selected” but members are not interactive.
- Inspecting another set mate requires closing the dialog and clicking that cell on the board.
- `InfoDialog` already provides dialog a11y: `role="dialog"`, focus trap, Escape, inert backdrop, focus restore to the trigger.

## Decisions

| Topic | Choice |
| --- | --- |
| Content on select | Full swap: hero, metrics, rent schedule, occupants, and “Your tile economics” (when applicable) follow the viewed tile |
| Interaction model | Each set member is a button; Tab moves through them; Enter/Space selects |
| Dialog title | Always matches the currently viewed tile |
| Focus after select | Stay on the activated set-member button |
| Screen readers | Polite `aria-live` announces the newly viewed tile name |
| Architecture | Lift `viewedPosition` into `BoardCell` / dialog shell (not nested dialogs) |

## Architecture

```
BoardCell
  viewedPosition state (init = cell position on open; reset on close)
  InfoDialog (title from viewed tile label)
    BoardTileDetailsContent(viewedPosition, onSelectSetMember)
      …full details for viewedPosition…
      Set membership → button per member
```

- **`BoardCell`** owns `viewedPosition`. It initializes to the cell’s board position when the dialog opens and resets when the dialog closes so the next open starts clean.
- **`InfoDialog`** title is dynamic: derived from the currently viewed tile’s label (not frozen at open time). May require a controlled/dynamic title prop if the component currently captures title only at mount.
- **`BoardTileDetailsContent`** renders all detail sections for `viewedPosition` and calls `onSelectSetMember(position)` when a set-member button is activated.
- **Data**: existing `tileDetails` / `buildTileSetInfo` only—no worker, shared engine, or API changes.
- **Scope of sets**: any tile type that already shows set membership (sector tiles, utilities, hubs).

### Rejected alternatives

- **Self-contained browser only inside `BoardTileDetailsContent`**: isolates logic but needs extra callbacks for title sync; easier to desync chrome and body.
- **Nested dialogs per set member**: worse a11y and close/stack UX; fights the single-`InfoDialog` pattern.

## Interaction & accessibility

1. **Open**: Activate board cell → one dialog opens (existing focus-to-Close behavior). Viewed tile = that cell.
2. **Browse**: Tab into Set membership; each member is a `<button>`. Activate → `viewedPosition` updates → full body + dialog title update.
3. **Switch back**: Activate any other member button (including the original); same path, no dialog stack.
4. **Selected state**: Viewed member has `aria-pressed="true"` (others `false`) plus existing selected styling; status may remain “Selected” for the viewed member.
5. **Re-select current**: No-op (no redundant live announcement).
6. **Announce**: Polite `aria-live` region announces e.g. `Viewing {tile name}` when the viewed tile changes to a different member.
7. **Close**: Escape, backdrop, or Close closes once. Focus restores to the **opener board cell** trigger, not a different cell for the last viewed set mate.
8. **Focus trap / inert**: Unchanged; browsing never leaves the single dialog.

## Edge cases

- No set section or single-member set: no navigation UI; behavior unchanged.
- “Your tile economics” follows the *viewed* tile when the viewer owns it.
- Live session updates while open: content continues to reflect current `tileDetails` for `viewedPosition`.
- Missing map entry for `viewedPosition` (should not happen): fall back to the opener cell’s position.

## Testing

- Component/unit: selecting a set member updates details and title; can return to original; close restores focus to opener trigger.
- A11y: members are buttons; `aria-pressed` reflects selection; live region updates on change; Escape still closes; Tab stays inside dialog.
- Prefer extending existing `InfoDialog` / board tile details tests rather than introducing a new dialog type.

## Out of scope

- Arrow-key listbox / radiogroup pattern
- Nested dialogs
- Opening this modal from mobile board overview
- Server/API or game-rules document changes (unless implementation reveals a contract gap—none expected)

## Implementation touchpoints (expected)

- `packages/web/src/components/BoardCell.tsx` — viewed state, dynamic title wiring
- `packages/web/src/components/BoardTileDetailsContent.tsx` — interactive set list, live region
- `packages/web/src/components/InfoDialog.tsx` — dynamic title if needed
- Related styles in `packages/web/src/styles/pages/app-pages.css`
- Tests adjacent to `InfoDialog` / board details components

## Success criteria

- From one opened property dialog, a keyboard or pointer user can view full details for every set mate, return to the original, and close the dialog once with focus restored to the board cell they opened.
- Screen-reader users learn which tile is being viewed after a set-member selection without leaving the dialog.
