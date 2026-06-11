import type {
  InternalGameState,
  LogEntry,
  RateCardState,
} from "./gameStateTypes.js";
import { RATE_CARD_MAX, RATE_CARD_MIN, RATE_CARD_STEP } from "./rent.js";
import { deepClone } from "./stateUtils.js";
import {
  getSyndicateForPlayer,
  hasSectorControl,
  ownsHubForSector,
} from "./syndicate.js";

export const RATE_CARD_RESET_ROUNDS = 3;

export type RateCardRevocationCause =
  | { type: "mortgage"; position: number | string }
  | { type: "trade" };

export function syndicateQualifiesForRateCard(
  state: InternalGameState,
  syndicateId: string,
  sectorId: string,
): boolean {
  const syndicate = state.syndicates?.[syndicateId];
  if (!syndicate) return false;
  const controller = syndicate.adminId;
  return (
    hasSectorControl(state, controller, sectorId) &&
    ownsHubForSector(state, controller, sectorId)
  );
}

export function clampRateCardMultiplier(multiplier: number): number {
  const stepped = Math.round(multiplier / RATE_CARD_STEP) * RATE_CARD_STEP;
  return Math.max(RATE_CARD_MIN, Math.min(RATE_CARD_MAX, stepped));
}

export function getActiveRateCardMultiplier(
  state: InternalGameState,
  sectorId: string,
  ownerId: string,
): number | undefined {
  const syndicate = getSyndicateForPlayer(state, ownerId);
  if (!syndicate) return undefined;
  const card = (state.rateCards ?? []).find(
    (entry) =>
      entry.sectorId === sectorId &&
      entry.syndicateId === syndicate.syndicateId,
  );
  if (!card) return undefined;
  if (!syndicateQualifiesForRateCard(state, syndicate.syndicateId, sectorId)) {
    return undefined;
  }
  return card.multiplier;
}

export function revokeUnqualifiedRateCards(
  state: InternalGameState,
  logs: LogEntry[],
  cause: RateCardRevocationCause,
): InternalGameState {
  const newState = deepClone(state);
  if (!newState.rateCards?.length) return newState;
  const before = newState.rateCards.length;
  newState.rateCards = newState.rateCards.filter((card) => {
    const stillQualifies = syndicateQualifiesForRateCard(
      newState,
      card.syndicateId,
      card.sectorId,
    );
    return stillQualifies;
  });
  if (newState.rateCards.length < before) {
    logs.push({
      playerId: null,
      actionType: "rate_card_revoked",
      payload: { cause },
    });
  }
  return newState;
}

export function recordOpposingSectorLanding(
  state: InternalGameState,
  visitorId: string,
  sectorId: string | null,
): InternalGameState {
  if (!sectorId || !state.rateCards?.length) return state;
  const newState = deepClone(state);
  for (const card of newState.rateCards ?? []) {
    if (card.sectorId !== sectorId) continue;
    const syndicate = state.syndicates?.[card.syndicateId];
    if (!syndicate) continue;
    if (syndicate.memberIds.includes(visitorId)) {
      continue;
    }
    card.roundsWithoutLanding = 0;
  }
  return newState;
}

export function tickRateCardPressureResets(
  state: InternalGameState,
  logs: LogEntry[],
): InternalGameState {
  const newState = deepClone(state);
  if (!newState.rateCards?.length) return newState;

  for (const card of newState.rateCards) {
    card.roundsWithoutLanding += 1;
    if (card.roundsWithoutLanding >= RATE_CARD_RESET_ROUNDS) {
      card.multiplier = 1;
      logs.push({
        playerId: null,
        actionType: "rate_card_reset",
        payload: { sectorId: card.sectorId, syndicateId: card.syndicateId },
      });
      card.roundsWithoutLanding = 0;
    }
  }
  return newState;
}

export function upsertRateCard(
  state: InternalGameState,
  syndicateId: string,
  sectorId: string,
  multiplier: number,
): RateCardState[] {
  const cards = [...(state.rateCards ?? [])];
  const clamped = clampRateCardMultiplier(multiplier);
  const existing = cards.findIndex(
    (entry) => entry.sectorId === sectorId && entry.syndicateId === syndicateId,
  );
  const next: RateCardState = {
    sectorId,
    syndicateId,
    multiplier: clamped,
    roundsWithoutLanding: 0,
  };
  if (existing >= 0) {
    cards[existing] = next;
  } else {
    cards.push(next);
  }
  return cards;
}
