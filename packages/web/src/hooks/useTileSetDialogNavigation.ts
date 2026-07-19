import { useCallback, useState } from "react";

/**
 * Owns set-browsing state for a board-tile details dialog: which tile is
 * viewed, live-region copy, reset on open/close, and member selection.
 * Relies on a stable opener `position` for the mounted cell.
 */
export function useTileSetDialogNavigation(openerPosition: number | string) {
  const [viewedPosition, setViewedPosition] = useState(openerPosition);
  const [viewAnnouncement, setViewAnnouncement] = useState("");

  const onDialogOpenChange = useCallback(
    (open: boolean) => {
      // Real open/close transitions only (InfoDialog never notifies on mount).
      // Reset on both so reopen always starts on the opener cell's tile.
      setViewedPosition(openerPosition);
      if (!open) {
        setViewAnnouncement("");
      }
    },
    [openerPosition],
  );

  const onSelectSetMember = useCallback(
    (nextPosition: number | string, label: string) => {
      if (String(nextPosition) === String(viewedPosition)) return;
      setViewAnnouncement(`Viewing ${label}`);
      setViewedPosition(nextPosition);
    },
    [viewedPosition],
  );

  return {
    viewedPosition,
    viewAnnouncement,
    onDialogOpenChange,
    onSelectSetMember,
  };
}
