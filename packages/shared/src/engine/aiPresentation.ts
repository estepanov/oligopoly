import type { GameAction } from "@oligopoly/validation";
import type { InternalGameState } from "./gameStateTypes.js";

export const AI_PRESENTATION_CAPITAL_THRESHOLD = 50;

export type AiPresentationReason =
  | "ownership_change"
  | "auction_opened"
  | "auction_settled"
  | "capital_transfer"
  | "bankruptcy"
  | "syndicate_form"
  | "syndicate_break"
  | "win_threshold"
  | "disruption_window";

export type AiPresentationBeat = {
  material: boolean;
  reason: AiPresentationReason | null;
  softTurnEnd: boolean;
  summary: string;
};

export type AiPresentationContext = {
  turnHadMaterial: boolean;
};

/** Dedicated AI seats + permanent kick replacements. Not timeout takeovers. */
export function isAiSeatForPresentation(
  state: InternalGameState,
  actorId: string,
): boolean {
  const player = state.players.find((p) => p.playerId === actorId);
  return player?.kind === "ai";
}

function ownershipChanged(
  prev: InternalGameState,
  next: InternalGameState,
): boolean {
  const prevOwners = new Map(
    prev.tiles.map((t) => [String(t.position), t.ownerId ?? null]),
  );
  for (const tile of next.tiles) {
    if (
      (prevOwners.get(String(tile.position)) ?? null) !== (tile.ownerId ?? null)
    ) {
      return true;
    }
  }
  return false;
}

function maxAbsCapitalDelta(
  prev: InternalGameState,
  next: InternalGameState,
): number {
  const prevCap = new Map(prev.players.map((p) => [p.playerId, p.capital]));
  let max = 0;
  for (const player of next.players) {
    const before = prevCap.get(player.playerId) ?? player.capital;
    max = Math.max(max, Math.abs(player.capital - before));
  }
  return max;
}

function summaryFor(
  reason: AiPresentationReason | null,
  softTurnEnd: boolean,
  action: Pick<GameAction, "type">,
): string {
  if (softTurnEnd) return "ended turn";
  switch (reason) {
    case "ownership_change":
      return "changed tile ownership";
    case "auction_opened":
      return "opened an auction";
    case "auction_settled":
      return "settled an auction";
    case "capital_transfer":
      return "moved Capital";
    case "bankruptcy":
      return "went bankrupt";
    case "syndicate_form":
      return "formed a syndicate";
    case "syndicate_break":
      return "broke a syndicate";
    case "win_threshold":
      return "crossed a win threshold";
    case "disruption_window":
      return "triggered a disruption window";
    case null:
      return action.type.replaceAll("_", " ");
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function classifyAiPresentationBeat(
  prev: InternalGameState,
  next: InternalGameState,
  action: Pick<GameAction, "type">,
  context: AiPresentationContext = { turnHadMaterial: false },
): AiPresentationBeat {
  let reason: AiPresentationReason | null = null;

  if (ownershipChanged(prev, next)) reason = "ownership_change";
  else if (!prev.pendingAuction && next.pendingAuction)
    reason = "auction_opened";
  else if (prev.pendingAuction && !next.pendingAuction)
    reason = "auction_settled";
  else if (
    (next.eliminatedPlayerIds?.length ?? 0) >
    (prev.eliminatedPlayerIds?.length ?? 0)
  )
    reason = "bankruptcy";
  else if (
    Object.keys(next.syndicates ?? {}).length >
    Object.keys(prev.syndicates ?? {}).length
  )
    reason = "syndicate_form";
  else if (
    Object.keys(next.syndicates ?? {}).length <
    Object.keys(prev.syndicates ?? {}).length
  )
    reason = "syndicate_break";
  else if (Boolean(next.winnerId) && !prev.winnerId) reason = "win_threshold";
  else if (Boolean(next.finalRound) && !prev.finalRound)
    reason = "disruption_window";
  else if (maxAbsCapitalDelta(prev, next) >= AI_PRESENTATION_CAPITAL_THRESHOLD)
    reason = "capital_transfer";

  const material = reason !== null;
  const softTurnEnd =
    action.type === "end_turn" && !material && !context.turnHadMaterial;

  return {
    material,
    reason,
    softTurnEnd,
    summary: summaryFor(reason, softTurnEnd, action),
  };
}
