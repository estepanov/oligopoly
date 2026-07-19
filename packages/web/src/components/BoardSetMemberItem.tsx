import type { TileSetMember } from "../lib/boardTileDetails";

export function BoardSetMemberItem({
  member,
  onSelect,
}: {
  member: TileSetMember;
  onSelect: (position: number | string, label: string) => void;
}) {
  const className = [
    "boardSetItem",
    member.selected ? "boardSetItemSelected" : "",
    member.mortgaged ? "boardSetItemMortgaged" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li>
      <button
        type="button"
        className={className}
        aria-pressed={member.selected}
        onClick={(event) => {
          if (member.selected) return;
          event.currentTarget.focus();
          onSelect(member.position, member.label);
        }}
      >
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
          {member.selected ? "Selected" : member.statusLabel}
        </span>
      </button>
    </li>
  );
}
