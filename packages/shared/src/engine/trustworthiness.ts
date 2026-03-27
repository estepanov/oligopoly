import {
  clampTrustworthiness,
  HANDSHAKE_BREACH_PENALTY,
  THREAD_EXPIRY_PENALTY,
  TRUSTWORTHINESS_BINDING_THRESHOLD,
} from "../index.js";

export function applyHandshakeBreach(score: number): number {
  return clampTrustworthiness(score + HANDSHAKE_BREACH_PENALTY);
}

export function applyThreadExpiry(score: number): number {
  return clampTrustworthiness(score + THREAD_EXPIRY_PENALTY);
}

export interface TrustworthinessRestrictions {
  canCreateBindingContract: boolean;
  restrictionLabel: "none" | "standard" | "restricted";
}

export function getTrustworthinessRestrictions(
  score: number,
): TrustworthinessRestrictions {
  if (score >= 8) {
    return { canCreateBindingContract: true, restrictionLabel: "none" };
  }
  if (score >= TRUSTWORTHINESS_BINDING_THRESHOLD) {
    return { canCreateBindingContract: true, restrictionLabel: "standard" };
  }
  return { canCreateBindingContract: false, restrictionLabel: "restricted" };
}
