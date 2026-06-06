import type { GameLogEntry } from "@oligopoly/validation";
import { tileLabel } from "./boardDisplay";
import {
  type CurrencyDisplaySettings,
  formatCurrencyAmount,
  formatSignedCurrencyAmount,
} from "./gameDisplay";

const ACTION_LABELS: Record<string, string> = {
  game_started: "Game started",
  roll_dice: "Rolled dice",
  buy_tile: "Bought tile",
  bought_tile: "Bought tile",
  decline_tile: "Declined tile",
  declined_tile: "Declined tile",
  path_choice: "Path choice",
  end_turn: "Ended turn",
  develop_tile: "Developed tile",
  developed_tile: "Developed tile",
  mortgage_tile: "Mortgaged tile",
  mortgaged_tile: "Mortgaged tile",
  redeem_tile: "Redeemed tile",
  redeemed_tile: "Redeemed tile",
  pay_rent: "Paid rent",
  pass_start: "Passed start",
  timeout_takeover: "Timeout takeover",
  auction_bids_closed: "Auction bids closed",
  auction_bid: "Auction bid",
  auction_pass: "Passed auction",
  auction_settled: "Auction settled",
  auction_no_bids: "Auction ended with no bids",
  auction_tie_break: "Auction tie-break round",
  market_event_drawn: "Market event drawn",
  market_event_resolved: "Market event resolved",
  market_event_capital_change: "Market event capital change",
  market_event_roll: "Market event roll",
  market_event_deck_empty: "Market event deck empty",
  disruption_drawn: "Disruption card drawn",
  disruption_resolved: "Disruption card resolved",
  disruption_capital_change: "Disruption capital change",
  disruption_deck_empty: "Disruption deck empty",
  disruption_discarded_hidden: "Disruption card discarded unseen",
  black_market_relay_drawn: "Black market relay resolved",
  affinity_bonus: "Affinity bonus collected",
  syndicate_formed: "Syndicate formed",
  capital_revealed: "Capital revealed",
  disruption_nullified: "Disruption card nullified",
  flash_crash_resolved: "Flash crash resolved",
  regulation_released: "Released from regulation",
  final_round_started: "Final round started",
  final_round_ended: "Final round ended",
  game_won: "Game won",
  player_state_changed: "Player changed",
};

function formatNumberDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function formatTileList(
  values: unknown,
  tileNames: Map<string, string>,
): string {
  if (!Array.isArray(values) || values.length === 0) return "";
  return values
    .map((value) => tileLabel(value as number | string, tileNames))
    .join(", ");
}

function formatPlayerId(
  value: unknown,
  playerNames?: Map<string, string>,
): string | null {
  if (typeof value !== "string") return null;
  return playerNames?.get(value) ?? value;
}

function formatPlayerList(
  values: unknown,
  playerNames?: Map<string, string>,
): string | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values
    .map((value) => formatPlayerId(value, playerNames))
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function formatMoneyPayloadParts(
  record: Record<string, unknown>,
  currencySettings?: CurrencyDisplaySettings,
): string[] {
  const parts: string[] = [];
  const fields = [
    { key: "amount", label: "amount", signed: false },
    { key: "remaining", label: "remaining", signed: false },
    { key: "total", label: "total", signed: false },
    { key: "interest", label: "interest", signed: false },
    { key: "proceeds", label: "proceeds", signed: false },
    { key: "applied", label: "applied", signed: false },
    { key: "debtRemaining", label: "debt remaining", signed: false },
    { key: "delta", label: "change", signed: true },
    { key: "capital", label: "capital", signed: false },
  ] as const;

  for (const field of fields) {
    const value = record[field.key];
    if (typeof value !== "number") continue;
    const formatted =
      field.signed || value < 0
        ? formatSignedCurrencyAmount(value, currencySettings)
        : formatCurrencyAmount(value, currencySettings);
    parts.push(`${field.label} ${formatted}`);
  }

  return parts;
}

function formatPlayerStateChange(
  record: Record<string, unknown>,
  tileNames: Map<string, string>,
  currencySettings?: CurrencyDisplaySettings,
): string {
  const changes = record.changes;
  if (!changes || typeof changes !== "object") return "";
  const changed = changes as Record<string, unknown>;
  const parts: string[] = [];

  const capital = changed.capital as
    | { before?: unknown; after?: unknown; delta?: unknown }
    | undefined;
  if (typeof capital?.delta === "number") {
    parts.push(
      `cash ${formatSignedCurrencyAmount(capital.delta, currencySettings)} to ${
        typeof capital.after === "number"
          ? formatCurrencyAmount(capital.after, currencySettings)
          : String(capital.after)
      }`,
    );
  }

  const owned = changed.ownedTilePositions as
    | { added?: unknown; removed?: unknown }
    | undefined;
  const acquired = formatTileList(owned?.added, tileNames);
  const lost = formatTileList(owned?.removed, tileNames);
  if (acquired) parts.push(`acquired ${acquired}`);
  if (lost) parts.push(`lost ${lost}`);

  const mortgaged = changed.mortgagedTilePositions as
    | { added?: unknown; removed?: unknown }
    | undefined;
  const newlyMortgaged = formatTileList(mortgaged?.added, tileNames);
  const redeemed = formatTileList(mortgaged?.removed, tileNames);
  if (newlyMortgaged) parts.push(`mortgaged ${newlyMortgaged}`);
  if (redeemed) parts.push(`redeemed ${redeemed}`);

  const development = changed.developmentTokens;
  if (Array.isArray(development) && development.length > 0) {
    for (const item of development) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      if (
        (typeof entry.position === "number" ||
          typeof entry.position === "string") &&
        typeof entry.before === "number" &&
        typeof entry.after === "number"
      ) {
        parts.push(
          `${tileLabel(entry.position, tileNames)} development ${entry.before}->${entry.after}`,
        );
      }
    }
  }

  const actionPoints = changed.actionPointsRemaining as
    | { after?: unknown; delta?: unknown }
    | undefined;
  if (typeof actionPoints?.delta === "number") {
    parts.push(
      `AP ${formatNumberDelta(actionPoints.delta)} to ${String(
        actionPoints.after,
      )}`,
    );
  }

  const trustworthiness = changed.trustworthiness as
    | { after?: unknown; delta?: unknown }
    | undefined;
  if (typeof trustworthiness?.delta === "number") {
    parts.push(
      `trust ${formatNumberDelta(trustworthiness.delta)} to ${String(
        trustworthiness.after,
      )}`,
    );
  }

  const debt = changed.outstandingDebt as
    | { after?: unknown; delta?: unknown }
    | undefined;
  if (typeof debt?.delta === "number") {
    parts.push(
      `debt ${formatSignedCurrencyAmount(debt.delta, currencySettings)} to ${
        typeof debt.after === "number"
          ? formatCurrencyAmount(debt.after, currencySettings)
          : String(debt.after)
      }`,
    );
  }

  const position = changed.position as { after?: unknown } | undefined;
  if (
    typeof position?.after === "number" ||
    typeof position?.after === "string"
  ) {
    parts.push(`moved to ${tileLabel(position.after, tileNames)}`);
  }

  if (changed.inRegulation) {
    const regulation = changed.inRegulation as { after?: unknown };
    parts.push(regulation.after ? "entered regulation" : "left regulation");
  }

  if (changed.syndicateId) {
    const syndicate = changed.syndicateId as { after?: unknown };
    parts.push(
      typeof syndicate.after === "string"
        ? `joined syndicate ${syndicate.after}`
        : "left syndicate",
    );
  }

  return parts.length > 0 ? ` · ${parts.join("; ")}` : "";
}

function formatGameWon(record: Record<string, unknown>): string {
  if (typeof record.reason === "string") {
    return ` · ${record.reason}`;
  }
  if (
    typeof record.marketValue === "number" &&
    typeof record.totalMarketValue === "number"
  ) {
    return ` · ${record.marketValue} of ${record.totalMarketValue} market value`;
  }
  return "";
}

function payloadSuffix(
  actionType: string,
  payload: unknown,
  tileNames: Map<string, string>,
  currencySettings?: CurrencyDisplaySettings,
  playerNames?: Map<string, string>,
): string {
  if (payload === null || payload === undefined) {
    return "";
  }

  if (typeof payload !== "object") {
    return `: ${String(payload)}`;
  }

  const record = payload as Record<string, unknown>;
  if (actionType === "game_won") {
    return formatGameWon(record);
  }
  if (actionType === "player_state_changed") {
    return formatPlayerStateChange(record, tileNames, currencySettings);
  }

  const playerParts: string[] = [];
  const target = formatPlayerId(record.targetPlayerId, playerNames);
  if (target) playerParts.push(`target ${target}`);
  const recipient = formatPlayerId(record.to, playerNames);
  if (recipient) playerParts.push(`to ${recipient}`);
  const from = formatPlayerId(record.fromPlayerId, playerNames);
  if (from) playerParts.push(`from ${from}`);
  const to = formatPlayerId(record.toPlayerId, playerNames);
  if (to) playerParts.push(`to ${to}`);
  const partyB = formatPlayerId(record.partyB, playerNames);
  if (partyB) playerParts.push(`with ${partyB}`);
  const human = formatPlayerId(record.humanId, playerNames);
  if (human) playerParts.push(human);
  const members = formatPlayerList(record.memberIds, playerNames);
  if (members) playerParts.push(`members ${members}`);
  const parties = formatPlayerList(record.partyIds, playerNames);
  if (parties) playerParts.push(`parties ${parties}`);
  const remaining = formatPlayerList(
    record.remainingTurnPlayerIds,
    playerNames,
  );
  if (remaining) playerParts.push(`remaining ${remaining}`);
  const contextParts: string[] = [];
  if (typeof record.name === "string") {
    contextParts.push(record.name);
  } else if (typeof record.cardId === "string") {
    contextParts.push(record.cardId.replaceAll("_", " "));
  }
  const moneyParts = formatMoneyPayloadParts(record, currencySettings);

  if (
    typeof record.position === "number" ||
    typeof record.position === "string"
  ) {
    const amount =
      typeof record.cost === "number"
        ? ` · ${formatCurrencyAmount(record.cost, currencySettings)}`
        : typeof record.mortgageValue === "number"
          ? ` · ${formatSignedCurrencyAmount(
              record.mortgageValue,
              currencySettings,
            )}`
          : typeof record.redemptionCost === "number"
            ? ` · ${formatCurrencyAmount(
                record.redemptionCost,
                currencySettings,
              )}`
            : "";
    return ` · ${[tileLabel(record.position, tileNames), ...playerParts].join(
      " · ",
    )}${amount}`;
  }
  if (
    typeof record.tilePosition === "number" ||
    typeof record.tilePosition === "string"
  ) {
    const amount =
      typeof record.amount === "number"
        ? ` · ${formatCurrencyAmount(record.amount, currencySettings)}`
        : "";
    return ` · ${[
      tileLabel(record.tilePosition, tileNames),
      ...playerParts,
    ].join(" · ")}${amount}`;
  }
  if (playerParts.length > 0 || moneyParts.length > 0) {
    return ` · ${[...contextParts, ...playerParts, ...moneyParts].join(" · ")}`;
  }
  if (typeof record.choice === "string") {
    return ` · ${record.choice}`;
  }
  if (typeof record.reason === "string") {
    return ` · ${record.reason}`;
  }
  if (typeof record.name === "string") {
    const trigger =
      typeof record.trigger === "string"
        ? ` · ${record.trigger.replaceAll("_", " ")}`
        : "";
    return ` · ${record.name}${trigger}`;
  }
  if (typeof record.cardId === "string") {
    const trigger =
      typeof record.trigger === "string"
        ? ` · ${record.trigger.replaceAll("_", " ")}`
        : "";
    return ` · ${record.cardId.replaceAll("_", " ")}${trigger}`;
  }

  return actionType.includes("_") ? "" : `: ${JSON.stringify(payload)}`;
}

export function formatGameLogEntry(
  entry: GameLogEntry,
  tileNames: Map<string, string>,
  currencySettings: CurrencyDisplaySettings | string = "$",
  playerNames?: Map<string, string>,
): string {
  const normalizedCurrencySettings =
    typeof currencySettings === "string"
      ? { currencySymbol: currencySettings }
      : currencySettings;
  const label =
    ACTION_LABELS[entry.actionType] ?? entry.actionType.replaceAll("_", " ");
  return `${label}${payloadSuffix(
    entry.actionType,
    entry.payload,
    tileNames,
    normalizedCurrencySettings,
    playerNames,
  )}`;
}
