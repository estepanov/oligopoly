import { NegotiationErrorKeys } from "@oligopoly/validation";
import { NEGOTIATION_THREAD_DURATION } from "../index.js";
import type { BindingContract, BindingContractTerm } from "./types.js";

export function isThreadExpired(
  thread: { startedRound: number; expiresAfterRound: number },
  currentRound: number,
): boolean {
  return currentRound > thread.expiresAfterRound;
}

export function calcThreadExpiry(startedRound: number): number {
  return startedRound + NEGOTIATION_THREAD_DURATION;
}

export function validateContractTerms(terms: BindingContractTerm[]): {
  valid: boolean;
  errorKey?: string;
} {
  if (terms.length === 0) {
    return {
      valid: false,
      errorKey: NegotiationErrorKeys.CONTRACT_INVALID_TERMS,
    };
  }

  const seen = new Set<string>();
  for (const term of terms) {
    const key = buildTermKey(term);
    if (seen.has(key)) {
      return {
        valid: false,
        errorKey: NegotiationErrorKeys.CONTRACT_INVALID_TERMS,
      };
    }
    seen.add(key);
  }

  return { valid: true };
}

function buildTermKey(term: BindingContractTerm): string {
  switch (term.type) {
    case "cannot_sell_tile":
      return `cannot_sell_tile:${term.tileId}:${term.boundPlayerId}`;
    case "cannot_bid_auction":
      return `cannot_bid_auction:${term.tileId}:${term.boundPlayerId}`;
    case "must_pay_capital":
      return `must_pay_capital:${term.fromPlayerId}:${term.toPlayerId}:${term.dueByRound}`;
    case "revenue_share":
      return `revenue_share:${term.fromPlayerId}:${term.toPlayerId}:${term.durationRounds}`;
  }
}

export function validateContractTileOwnership(
  terms: BindingContractTerm[],
  ownedTilesByParty: Record<string, string[]>,
): { valid: boolean; errorKey?: string } {
  for (const term of terms) {
    if (
      term.type === "cannot_sell_tile" ||
      term.type === "cannot_bid_auction"
    ) {
      const owned = ownedTilesByParty[term.boundPlayerId];
      if (!owned?.includes(term.tileId)) {
        return {
          valid: false,
          errorKey: NegotiationErrorKeys.CONTRACT_TILE_NOT_OWNED,
        };
      }
    }
  }
  return { valid: true };
}

export function isActionBlockedByContracts(
  activeContracts: BindingContract[],
  action: { type: string; tileId?: string; playerId: string },
): { blocked: boolean; blockingContractId?: string } {
  for (const contract of activeContracts) {
    if (contract.status !== "active") {
      continue;
    }
    for (const term of contract.terms) {
      if (isTermViolated(term, action)) {
        return { blocked: true, blockingContractId: contract.id };
      }
    }
  }
  return { blocked: false };
}

function isTermViolated(
  term: BindingContractTerm,
  action: { type: string; tileId?: string; playerId: string },
): boolean {
  switch (term.type) {
    case "cannot_sell_tile":
      return (
        action.type === "sell_tile" &&
        action.tileId === term.tileId &&
        action.playerId === term.boundPlayerId
      );
    case "cannot_bid_auction":
      return (
        action.type === "bid_auction" &&
        action.tileId === term.tileId &&
        action.playerId === term.boundPlayerId
      );
    default:
      return false;
  }
}
