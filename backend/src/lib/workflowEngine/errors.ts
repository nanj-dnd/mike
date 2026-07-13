// Error classification for retry policies: retryable infrastructure
// failures (rate limits, timeouts, 5xx/overload) vs non-retryable
// validation/configuration failures.

import type { ErrorClass } from "./types";

export class EngineNodeError extends Error {
  readonly errorClass: ErrorClass;

  constructor(errorClass: ErrorClass, message: string) {
    super(message);
    this.name = "EngineNodeError";
    this.errorClass = errorClass;
  }
}

export function classifyError(error: unknown): { class: ErrorClass; message: string } {
  if (error instanceof EngineNodeError) {
    return { class: error.errorClass, message: error.message };
  }
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const lower = message.toLowerCase();

  if (error instanceof Error && error.name === "AbortError") {
    return { class: "canceled", message: "Aborted" };
  }
  if (/rate.?limit|429|too many requests|quota exceeded|resource.?exhausted/.test(lower)) {
    return { class: "rate_limit", message };
  }
  if (/timeout|timed out|deadline exceeded|etimedout|socket hang up/.test(lower)) {
    return { class: "timeout", message };
  }
  if (
    /\b(500|502|503|504|529)\b|overloaded|internal server error|service unavailable|bad gateway|econnreset|econnrefused|fetch failed|network error/.test(
      lower,
    )
  ) {
    return { class: "server_error", message };
  }
  return { class: "validation", message };
}
