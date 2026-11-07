import { ERROR_CATALOG, type ErrorCode, type ErrorStatus } from './catalog';

export interface FieldError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

export type { ErrorCode, ErrorStatus };

/** HTTP-facing error with a catalogued code and a message safe to show clients. */
export class HttpError extends Error {
  readonly status: ErrorStatus;

  constructor(
    readonly code: ErrorCode,
    message: string = ERROR_CATALOG[code].message,
    readonly fields?: readonly FieldError[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HttpError';
    this.status = ERROR_CATALOG[code].status;
  }
}

export const httpError = (code: ErrorCode, message?: string, fields?: readonly FieldError[]) =>
  new HttpError(code, message, fields);

export const badRequest = (message?: string) => new HttpError('BAD_REQUEST', message);
export const unauthenticated = (message?: string) => new HttpError('UNAUTHENTICATED', message);
export const forbidden = (message?: string) => new HttpError('FORBIDDEN', message);
export const notFound = (message?: string) => new HttpError('NOT_FOUND', message);
export const conflict = (
  message?: string,
  code: 'CONFLICT' | 'UNIQUE_VIOLATION' | 'FOREIGN_KEY_VIOLATION' = 'CONFLICT',
) => new HttpError(code, message);
export const validationFailed = (fields: readonly FieldError[], message?: string) =>
  new HttpError('VALIDATION_FAILED', message, fields);
export const tooManyRequests = (message?: string) => new HttpError('TOO_MANY_REQUESTS', message);
export const serviceUnavailable = (message?: string) => new HttpError('SERVICE_UNAVAILABLE', message);
