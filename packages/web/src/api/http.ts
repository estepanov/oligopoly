import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown = undefined,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch JSON and validate with a Zod schema.
 * Throws {@link ApiError} on HTTP or parse failure.
 */
export async function requestJson<T>(
  url: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError("Response was not valid JSON", res.status);
  }

  if (!res.ok) {
    throw new ApiError(
      typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${res.status})`,
      res.status,
      json,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      "Response did not match expected shape",
      res.status,
      json,
    );
  }
  return parsed.data;
}

/**
 * Convenience helper for simple GET requests.
 */
export function getJson<T>(
  url: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  return requestJson(url, schema, init);
}
