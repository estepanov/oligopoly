import { tileLabel } from "./boardDisplay";
import {
  type CurrencyDisplaySettings,
  formatCurrencyAmount,
} from "./gameDisplay";
import type { ActionLogPresentation } from "./gameLogDisplay";

/** Headline labels for `trade_*` game-log entries. */
export const TRADE_ACTION_LABELS: Record<string, string> = {
  trade_proposed: "Trade proposed",
  trade_accepted: "Trade accepted",
  trade_rejected: "Trade rejected",
  trade_expired: "Trade expired",
  trade_countered: "Trade countered",
};

/** Card presentation (badge/eyebrow/tone/description) for `trade_*` entries. */
export const TRADE_ACTION_PRESENTATION: Record<string, ActionLogPresentation> =
  {
    trade_proposed: {
      badge: "Offer",
      description:
        "A player proposed a trade. The terms list what each side gives and requests.",
      eyebrow: "Trade",
      tone: "deal",
    },
    trade_accepted: {
      badge: "Done",
      description:
        "A trade was accepted. Cash and tile ownership transferred between the two parties.",
      eyebrow: "Trade",
      tone: "deal",
    },
    trade_rejected: {
      badge: "Declined",
      description: "A player rejected a pending trade offer.",
      eyebrow: "Trade",
      tone: "deal",
    },
    trade_expired: {
      badge: "Expired",
      description: "A pending trade offer expired before it was resolved.",
      eyebrow: "Trade",
      tone: "deal",
    },
    trade_countered: {
      badge: "Counter",
      description:
        "A player countered a trade with revised terms, replacing the prior offer.",
      eyebrow: "Trade",
      tone: "deal",
    },
  };

function formatTradePlayerId(
  value: unknown,
  playerNames?: Map<string, string>,
): string | null {
  if (typeof value !== "string") return null;
  return playerNames?.get(value) ?? value;
}

function formatTradeTransfer(
  value: unknown,
  tileNames: Map<string, string>,
  currencySettings?: CurrencyDisplaySettings,
): string {
  if (!value || typeof value !== "object") return "nothing";
  const transfer = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof transfer.capital === "number" && transfer.capital > 0) {
    parts.push(formatCurrencyAmount(transfer.capital, currencySettings));
  }
  if (Array.isArray(transfer.tilePositions)) {
    const tiles = transfer.tilePositions
      .filter(
        (position): position is number | string =>
          typeof position === "number" || typeof position === "string",
      )
      .map((position) => tileLabel(position, tileNames));
    parts.push(...tiles);
  }
  return parts.length > 0 ? parts.join(" + ") : "nothing";
}

/** Payload suffix for `trade_*` entries (parties + give/request terms). */
export function formatTradePayload(
  record: Record<string, unknown>,
  tileNames: Map<string, string>,
  currencySettings?: CurrencyDisplaySettings,
  playerNames?: Map<string, string>,
): string {
  const proposer = formatTradePlayerId(record.proposerId, playerNames);
  const recipient = formatTradePlayerId(record.recipientId, playerNames);
  const parties =
    proposer && recipient ? `${proposer} to ${recipient}` : undefined;
  const gives = formatTradeTransfer(record.gives, tileNames, currencySettings);
  const receives = formatTradeTransfer(
    record.receives,
    tileNames,
    currencySettings,
  );
  const parts = [parties, `gives ${gives}`, `requests ${receives}`].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}
