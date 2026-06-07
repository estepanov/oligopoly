import { z } from "zod";

const jsonArrayUnknownSchema = z.array(z.unknown());

/**
 * Safely parse a JSON string with a Zod schema, returning `fallback` on
 * missing input, invalid JSON, or schema failure (never throws).
 */
export function safeParseJson<T>(
  raw: string | null | undefined,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (raw == null) return fallback;
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

/**
 * Parse arbitrary JSON; returns `null` on missing input, invalid JSON, or
 * non-JSON values that fail to parse (never throws).
 */
export function safeJsonParse(raw: string | null | undefined): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Parse JSON expected to be an array; corrupt JSON or non-arrays become `[]`
 * (never throws). Use `safeParseJson` with a tighter schema when validating
 * element shapes.
 */
export function safeParseJsonArray(raw: string | null | undefined): unknown[] {
  return safeParseJson(raw, jsonArrayUnknownSchema, []);
}

/**
 * Parse JSON as an array, validate each element with `elementSchema`, and keep
 * only valid rows. Corrupt JSON or non-arrays become `[]` (never throws).
 */
export function safeParseJsonArrayElements<T>(
  raw: string | null | undefined,
  elementSchema: z.ZodType<T>,
): T[] {
  const items = safeParseJsonArray(raw);
  const result: T[] = [];
  for (const item of items) {
    const parsed = elementSchema.safeParse(item);
    if (parsed.success) {
      result.push(parsed.data);
    }
  }
  return result;
}
