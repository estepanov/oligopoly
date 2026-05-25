export const TRUSTWORTHINESS_DEFAULT = 7;
export const TRUSTWORTHINESS_MIN = 0;
export const TRUSTWORTHINESS_MAX = 10;
export const TRUSTWORTHINESS_BINDING_THRESHOLD = 5;
export const HANDSHAKE_BREACH_PENALTY = -2;
export const THREAD_EXPIRY_PENALTY = -1;
export const NEGOTIATION_THREAD_DURATION = 3;

export function clampTrustworthiness(score: number): number {
  return Math.max(TRUSTWORTHINESS_MIN, Math.min(TRUSTWORTHINESS_MAX, score));
}

export function canCreateBindingContract(trustScore: number): boolean {
  return trustScore >= TRUSTWORTHINESS_BINDING_THRESHOLD;
}
