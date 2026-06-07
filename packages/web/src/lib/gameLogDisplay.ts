import {
  type GameLogEntry,
  PLAYER_STATE_CHANGE_FIELD_KEYS,
  PlayerStateChangedPayloadSchema,
  type PlayerStateChangeFieldKey,
  type PlayerStateChangesBody,
} from "@oligopoly/validation";
import { tileLabel } from "./boardDisplay";
import {
  type CurrencyDisplaySettings,
  formatCurrencyAmount,
  formatSignedCurrencyAmount,
} from "./gameDisplay";

/** Past-tense engine log types map to the same label as the imperative action. */
const ENGINE_LOG_ACTION_ALIASES: Record<string, string> = {
  bought_tile: "buy_tile",
  declined_tile: "decline_tile",
  developed_tile: "develop_tile",
  mortgaged_tile: "mortgage_tile",
  redeemed_tile: "redeem_tile",
};

function canonicalLogActionType(actionType: string): string {
  return ENGINE_LOG_ACTION_ALIASES[actionType] ?? actionType;
}

const ACTION_LABELS: Record<string, string> = {
  game_started: "Game started",
  roll_dice: "Rolled dice",
  buy_tile: "Bought tile",
  decline_tile: "Declined tile",
  path_choice: "Path choice",
  end_turn: "Ended turn",
  develop_tile: "Developed tile",
  mortgage_tile: "Mortgaged tile",
  redeem_tile: "Redeemed tile",
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
  rate_card_set: "Rate card set",
  round_phase_advanced: "Round advanced",
  round_boundary_complete: "Round housekeeping complete",
  debt_interest: "Debt interest accrued",
  new_round: "New round",
};

/** Tile actions: money and inventory deltas belong on `player_state_changed`. */
const TILE_NAME_ONLY_LOG_TYPES = new Set([
  "buy_tile",
  "decline_tile",
  "develop_tile",
  "mortgage_tile",
  "redeem_tile",
]);

function formatNumberDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function formatTileList(
  values: (string | number)[] | undefined,
  tileNames: Map<string, string>,
): string {
  if (!values || values.length === 0) return "";
  return values.map((value) => tileLabel(value, tileNames)).join(", ");
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

type PlayerStateLogPartFn = (
  changes: PlayerStateChangesBody,
  tileNames: Map<string, string>,
  currencySettings?: CurrencyDisplaySettings,
) => string | null;

/** Mirrors keyed diff maps in the engine — one formatter per registry field. */
const PLAYER_STATE_LOG_PARTS: {
  [K in PlayerStateChangeFieldKey]: PlayerStateLogPartFn;
} = {
  capital(changes, _tileNames, currencySettings) {
    const capital = changes.capital;
    if (typeof capital?.delta !== "number") return null;
    return `cash ${formatSignedCurrencyAmount(capital.delta, currencySettings)} to ${
      typeof capital.after === "number"
        ? formatCurrencyAmount(capital.after, currencySettings)
        : String(capital.after)
    }`;
  },
  ownedTilePositions(changes, tileNames) {
    const owned = changes.ownedTilePositions;
    const acquired = formatTileList(owned?.added, tileNames);
    const lost = formatTileList(owned?.removed, tileNames);
    const parts: string[] = [];
    if (acquired) parts.push(`acquired ${acquired}`);
    if (lost) parts.push(`lost ${lost}`);
    return parts.length > 0 ? parts.join("; ") : null;
  },
  mortgagedTilePositions(changes, tileNames) {
    const mortgagedTiles = changes.mortgagedTilePositions;
    const newlyMortgaged = formatTileList(mortgagedTiles?.added, tileNames);
    const redeemed = formatTileList(mortgagedTiles?.removed, tileNames);
    const parts: string[] = [];
    if (newlyMortgaged) parts.push(`mortgaged ${newlyMortgaged}`);
    if (redeemed) parts.push(`redeemed ${redeemed}`);
    return parts.length > 0 ? parts.join("; ") : null;
  },
  developmentTokens(changes, tileNames) {
    const development = changes.developmentTokens;
    if (!Array.isArray(development) || development.length === 0) return null;
    return development
      .map(
        (item) =>
          `${tileLabel(item.position, tileNames)} development ${item.before}->${item.after}`,
      )
      .join("; ");
  },
  actionPointsRemaining(changes) {
    const actionPoints = changes.actionPointsRemaining;
    if (typeof actionPoints?.delta !== "number") return null;
    return `AP ${formatNumberDelta(actionPoints.delta)} to ${String(
      actionPoints.after,
    )}`;
  },
  trustworthiness(changes) {
    const trustworthiness = changes.trustworthiness;
    if (typeof trustworthiness?.delta !== "number") return null;
    return `trust ${formatNumberDelta(trustworthiness.delta)} to ${String(
      trustworthiness.after,
    )}`;
  },
  outstandingDebt(changes, _tileNames, currencySettings) {
    const debt = changes.outstandingDebt;
    if (typeof debt?.delta !== "number") return null;
    return `debt ${formatSignedCurrencyAmount(debt.delta, currencySettings)} to ${
      typeof debt.after === "number"
        ? formatCurrencyAmount(debt.after, currencySettings)
        : String(debt.after)
    }`;
  },
  position(changes, tileNames) {
    const position = changes.position;
    if (
      typeof position?.after !== "number" &&
      typeof position?.after !== "string"
    ) {
      return null;
    }
    return `moved to ${tileLabel(position.after, tileNames)}`;
  },
  inRegulation(changes) {
    const ir = changes.inRegulation;
    if (!ir) return null;
    return ir.after ? "entered regulation" : "left regulation";
  },
  syndicateId(changes) {
    const syn = changes.syndicateId;
    if (!syn) return null;
    return typeof syn.after === "string"
      ? `joined syndicate ${syn.after}`
      : "left syndicate";
  },
};

type _AssertEqual<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

type _PlayerStateLogPartKeysMatchTuple = _AssertEqual<
  keyof typeof PLAYER_STATE_LOG_PARTS,
  PlayerStateChangeFieldKey
>;
const _enforcePlayerStateLogPartKeys: _PlayerStateLogPartKeysMatchTuple = true;
void _enforcePlayerStateLogPartKeys;

function formatPlayerStateChange(
  payload: unknown,
  tileNames: Map<string, string>,
  currencySettings?: CurrencyDisplaySettings,
): string {
  const parsed = PlayerStateChangedPayloadSchema.safeParse(payload);
  if (!parsed.success) return "";
  const { changes } = parsed.data;
  const parts: string[] = [];
  for (const key of PLAYER_STATE_CHANGE_FIELD_KEYS) {
    const line = PLAYER_STATE_LOG_PARTS[key](
      changes,
      tileNames,
      currencySettings,
    );
    if (line) parts.push(line);
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

function tilePositionFromPayload(
  record: Record<string, unknown>,
): number | string | undefined {
  if (
    typeof record.tilePosition === "number" ||
    typeof record.tilePosition === "string"
  ) {
    return record.tilePosition as number | string;
  }
  if (
    typeof record.position === "number" ||
    typeof record.position === "string"
  ) {
    return record.position as number | string;
  }
  return undefined;
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
  const canonicalType = canonicalLogActionType(actionType);

  if (actionType === "game_won") {
    return formatGameWon(record);
  }
  if (actionType === "player_state_changed") {
    return formatPlayerStateChange(record, tileNames, currencySettings);
  }

  if (TILE_NAME_ONLY_LOG_TYPES.has(canonicalType)) {
    const pos = tilePositionFromPayload(record);
    if (pos !== undefined) {
      return ` · ${tileLabel(pos, tileNames)}`;
    }
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

  const geoPos = tilePositionFromPayload(record);
  if (geoPos !== undefined) {
    let amountSuffix = "";
    if (typeof record.cost === "number") {
      amountSuffix = ` · ${formatCurrencyAmount(record.cost, currencySettings)}`;
    } else if (typeof record.amount === "number") {
      amountSuffix = ` · ${formatCurrencyAmount(
        record.amount,
        currencySettings,
      )}`;
    }
    return ` · ${[tileLabel(geoPos, tileNames), ...playerParts].join(
      " · ",
    )}${amountSuffix}`;
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
  const labelKey = canonicalLogActionType(entry.actionType);
  const label =
    ACTION_LABELS[labelKey] ?? entry.actionType.replaceAll("_", " ");
  return `${label}${payloadSuffix(
    entry.actionType,
    entry.payload,
    tileNames,
    normalizedCurrencySettings,
    playerNames,
  )}`;
}
