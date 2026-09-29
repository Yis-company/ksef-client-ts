export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  retryNetworkErrors: boolean;
}

export function defaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30_000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
    retryNetworkErrors: true,
  };
}

export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const exponential = policy.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * policy.baseDelayMs;
  return Math.min(exponential + jitter, policy.maxDelayMs);
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Failures raised before any byte of the request reached the server. */
const NOT_SENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PATCH']);

/**
 * Whether a thrown transport error may be retried.
 *
 * For a non-idempotent `method` (POST, PATCH) only errors raised before the
 * request was sent qualify: after a timeout or a dropped connection the server
 * may already have acted on it, and a retry could repeat the side effect.
 * Omitting `method` treats the request as idempotent.
 */
export function isRetryableError(error: unknown, policy: RetryPolicy, method?: string): boolean {
  if (!policy.retryNetworkErrors) return false;
  if (!(error instanceof Error)) return false;

  const code = (error as NodeJS.ErrnoException).code;
  if (method && NON_IDEMPOTENT_METHODS.has(method.toUpperCase())) {
    return code !== undefined && NOT_SENT_ERROR_CODES.has(code);
  }

  if (error.name === 'AbortError') return true;

  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

  return false;
}

export function isRetryableStatus(status: number, policy: RetryPolicy): boolean {
  return policy.retryableStatusCodes.includes(status);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
