import type { Context, Env, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ERROR_CATALOG, type ErrorCode } from './catalog';
import { type FieldError, HttpError } from './http-error';

export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly fields?: readonly FieldError[];
    readonly requestId?: string;
  };
}

export interface ErrorHandlingOptions {
  /** When false (production), 5xx messages are replaced by the catalog message. */
  readonly exposeInternalErrors: boolean;
  readonly report?: (error: Error, context: { requestId?: string; method: string; path: string }) => void;
}

const HTTP_EXCEPTION_CODES: Readonly<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

const POSTGRES_CODES: Readonly<Record<string, ErrorCode>> = {
  '23505': 'UNIQUE_VIOLATION',
  '23503': 'FOREIGN_KEY_VIOLATION',
};

interface ErrorLike {
  readonly code?: string | number;
  readonly cause?: ErrorOptions['cause'];
}

function readRequestId(c: Context): string | undefined {
  const value = (c.var as { requestId?: string }).requestId;
  return typeof value === 'string' ? value : undefined;
}

/** Walks the cause chain (Drizzle wraps driver errors) looking for a SQLSTATE we map. */
function postgresCode(error: Error): ErrorCode | undefined {
  let current: ErrorLike | undefined = error;
  for (let depth = 0; current && depth < 4; depth++) {
    const mapped = typeof current.code === 'string' ? POSTGRES_CODES[current.code] : undefined;
    if (mapped) return mapped;
    current = typeof current.cause === 'object' && current.cause !== null ? (current.cause as ErrorLike) : undefined;
  }
  return undefined;
}

function classify(error: Error): { code: ErrorCode; message: string; fields?: readonly FieldError[] } {
  if (error instanceof HttpError) return { code: error.code, message: error.message, fields: error.fields };
  if (error instanceof HTTPException) {
    if (error.status === 400 && /malformed json/i.test(error.message)) {
      return { code: 'MALFORMED_JSON', message: ERROR_CATALOG.MALFORMED_JSON.message };
    }
    const code = HTTP_EXCEPTION_CODES[error.status] ?? (error.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    return { code, message: error.message || ERROR_CATALOG[code].message };
  }
  const code = postgresCode(error);
  if (code) return { code, message: ERROR_CATALOG[code].message };
  return { code: 'INTERNAL_ERROR', message: error.message };
}

/** Converts any thrown error into its catalogued status and safe envelope. */
export function toErrorResponse(
  error: Error,
  options: ErrorHandlingOptions,
  requestId?: string,
): { status: ContentfulStatusCode; body: ErrorEnvelope; headers?: Headers } {
  const { code, message, fields } = classify(error);
  const status = ERROR_CATALOG[code].status as ContentfulStatusCode;
  const safeMessage = status >= 500 && !options.exposeInternalErrors ? ERROR_CATALOG[code].message : message;
  return {
    status,
    body: { error: { code, message: safeMessage, ...(fields ? { fields } : {}), ...(requestId ? { requestId } : {}) } },
    headers: error instanceof HTTPException ? error.res?.headers : undefined,
  };
}

/**
 * Installs the central error boundary using Hono's `onError`/`notFound`.
 * Hono catches downstream exceptions before they return through
 * `await next()`, so this is the framework's only error boundary.
 */
export function installErrorHandling<E extends Env>(app: Hono<E>, options: ErrorHandlingOptions): Hono<E> {
  app.onError((error, c) => {
    const requestId = readRequestId(c);
    const { status, body, headers } = toErrorResponse(error, options, requestId);
    if (status >= 500) options.report?.(error, { requestId, method: c.req.method, path: c.req.path });
    headers?.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== 'content-type' && lower !== 'content-length') c.header(key, value);
    });
    return c.json(body, status);
  });
  app.notFound((c) => {
    const { status, body } = toErrorResponse(new HttpError('ROUTE_NOT_FOUND'), options, readRequestId(c));
    return c.json(body, status);
  });
  return app;
}
