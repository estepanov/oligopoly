import { HealthResponseSchema } from "@oligopoly/validation";
import { env } from "../env";
import { getJson } from "./http";

export function fetchHealth() {
  return getJson(`${env.apiUrl}/api/health`, HealthResponseSchema);
}
