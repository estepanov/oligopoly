import type { GameAction, PendingInsiderPeek } from "@oligopoly/validation";

type InsiderPeekPanelProps = {
  insiderPeek?: PendingInsiderPeek;
  myPlayerId: string | null;
  busy: boolean;
  onAction: (label: string, action: GameAction) => Promise<void>;
};

export function InsiderPeekPanel({
  insiderPeek,
  myPlayerId,
  busy,
  onAction,
}: InsiderPeekPanelProps) {
  if (!insiderPeek) {
    return (
      <p className="muted">
        Waiting for insider-trading choice from the active player…
      </p>
    );
  }

  return (
    <div className="cardNested">
      <h3>Insider trading</h3>
      <p className="muted">
        Peeked market event:{" "}
        <code className="inline">{insiderPeek.cardId}</code>
      </p>
      <div className="buttonRow">
        <button
          type="button"
          className="button"
          disabled={busy || myPlayerId !== insiderPeek.drawingPlayerId}
          onClick={() =>
            void onAction("Kept peeked card", {
              type: "insider_keep_market_event",
            })
          }
        >
          Play this card
        </button>
        <button
          type="button"
          className="button buttonSecondary"
          disabled={busy || myPlayerId !== insiderPeek.drawingPlayerId}
          onClick={() =>
            void onAction("Discarded peeked card", {
              type: "insider_discard_market_event",
            })
          }
        >
          Discard and draw next
        </button>
      </div>
    </div>
  );
}
