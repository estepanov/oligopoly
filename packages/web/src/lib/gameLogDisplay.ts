import type { GameLogEntry } from "@oligopoly/validation";
import { tileLabel } from "./boardDisplay";

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
};

function payloadSuffix(
  actionType: string,
  payload: unknown,
  tileNames: Map<string, string>,
): string {
  if (payload === null || payload === undefined) {
    return "";
  }

  if (typeof payload !== "object") {
    return `: ${String(payload)}`;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.position === "number" ||
    typeof record.position === "string"
  ) {
    return ` · ${tileLabel(record.position, tileNames)}`;
  }
  if (
    typeof record.tilePosition === "number" ||
    typeof record.tilePosition === "string"
  ) {
    return ` · ${tileLabel(record.tilePosition, tileNames)}`;
  }
  if (typeof record.choice === "string") {
    return ` · ${record.choice}`;
  }
  if (typeof record.reason === "string") {
    return ` · ${record.reason}`;
  }

  return actionType.includes("_") ? "" : `: ${JSON.stringify(payload)}`;
}

export function formatGameLogEntry(
  entry: GameLogEntry,
  tileNames: Map<string, string>,
): string {
  const label =
    ACTION_LABELS[entry.actionType] ?? entry.actionType.replaceAll("_", " ");
  return `${label}${payloadSuffix(entry.actionType, entry.payload, tileNames)}`;
}
