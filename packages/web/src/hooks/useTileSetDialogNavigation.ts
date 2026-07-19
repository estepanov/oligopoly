import { useCallback, useState } from "react";

/**
 * Owns set-browsing state for a board-tile details dialog: which tile is
 * viewed, live-region copy, reset on close, and member selection.
 * Relies on a stable opener `position` for the mounted cell.
 * Selected-member no-ops are handled in `BoardSetMemberItem` (UI layer).
 */
export function useTileSetDialogNavigation(openerPosition: number | string) {
  const [viewedPosition, setViewedPosition] = useState(openerPosition);
  const [viewAnnouncement, setViewAnnouncement] = useState("");

  const onDialogOpenChange = useCallback(
    (open: boolean) => {
      // Real open/close transitions only (InfoDialog never notifies on mount).
      // Close resets; next open starts from opener via this + initial useState.
      if (!open) {
        setViewedPosition(openerPosition);
        setViewAnnouncement("");
      }
    },
    [openerPosition],
  );

  const onSelectSetMember = useCallback(
    (nextPosition: number | string, label: string) => {
      setViewAnnouncement(`Viewing ${label}`);
      setViewedPosition(nextPosition);
    },
    [],
  );

  return {
    viewedPosition,
    viewAnnouncement,
    onDialogOpenChange,
    onSelectSetMember,
  };
}
