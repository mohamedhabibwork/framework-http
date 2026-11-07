import type { Application } from '@framework/core';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { FrameworkEnv } from './context';
import { type ErrorHandlingOptions, installErrorHandling } from './errors/handler';
import { HttpError } from './errors/http-error';
import { type ActorResolver, requestScope } from './middleware/request-scope';

/** Hono's secure-headers option shape, derived from the middleware itself. */
type SecureHeadersConfig = NonNullable<Parameters<typeof secureHeaders>[0]>;

/** Strict security-header preset: every hardening header explicitly set. */
export const STRICT_SECURE_HEADERS: SecureHeadersConfig = {
  contentSecurityPolicy: { defaultSrc: ["'self'"] },
  crossOriginResourcePolicy: 'same-origin',
  crossOriginOpenerPolicy: 'same-origin',
  originAgentCluster: true,
  referrerPolicy: 'no-referrer',
  strictTransportSecurity: 'max-age=63072000; includeSubDomains',
  xContentTypeOptions: 'nosniff',
  xDnsPrefetchControl: 'off',
  xDownloadOptions: 'noopen',
  xFrameOptions: 'DENY',
  xPermittedCrossDomainPolicies: 'none',
};

export interface KernelCorsOptions {
  /** Origin allowlist. Empty means CORS stays off entirely. */
  readonly origins: readonly string[];
  /** Default: standard API methods. */
  readonly allowMethods?: readonly string[];
  /** Default: `Content-Type` and `Authorization`. */
  readonly allowHeaders?: readonly string[];
  /** Default true — the API authenticates with cookies and Bearer tokens. */
  readonly credentials?: boolean;
  /** Preflight cache in seconds. Default 86400. */
  readonly maxAge?: number;
}

export interface HttpKernelOptions extends ErrorHandlingOptions {
  /** Maximum request body in bytes. Default 1 MiB. */
  readonly maxBodyBytes?: number;
  /** Who is acting for each request; defaults to the anonymous actor. */
  readonly resolveActor?: ActorResolver;
  /**
   * Security headers. Default: {@link STRICT_SECURE_HEADERS}. `false` opts
   * out entirely (e.g. a pure JSON API behind an edge proxy that already sets
   * them); an object overrides individual headers on top of the strict preset.
   */
  readonly secureHeaders?: boolean | SecureHeadersConfig;
  /**
   * CORS. Default: off (same-origin only — the strict default). Enabled with
   * a non-empty origin allowlist, mounted before any auth middleware so
   * preflights succeed without credentials.
   */
  readonly cors?: KernelCorsOptions | false;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_CORS_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'] as const;
const DEFAULT_CORS_HEADERS = ['Content-Type', 'Authorization'] as const;
const DEFAULT_CORS_MAX_AGE = 86_400;

/**
 * Creates the root typed Hono application with the framework's fixed outer
 * order: request id -> body limit -> request scope -> security headers ->
 * CORS -> application middleware/routes. Errors are converted by `onError`.
 * Applications then chain native middleware and `.route()` modules onto the
 * returned instance; the result's type is usable by Hono RPC clients.
 */
export function createHttpKernel<TConfig extends object>(
  application: Application<TConfig>,
  options: HttpKernelOptions,
): Hono<FrameworkEnv> {
  const http = new Hono<FrameworkEnv>();
  installErrorHandling(http, options);
  http.use(requestId());
  http.use(
    bodyLimit({
      maxSize: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      onError: () => {
        throw new HttpError('PAYLOAD_TOO_LARGE');
      },
    }),
  );
  http.use(requestScope(application, options.resolveActor));

  // Security headers run before CORS so even blocked cross-origin responses
  // carry the hardening headers.
  if (options.secureHeaders !== false) {
    const overrides = typeof options.secureHeaders === 'object' ? options.secureHeaders : {};
    http.use(secureHeaders({ ...STRICT_SECURE_HEADERS, ...overrides }));
  }
  if (options.cors && options.cors.origins.length > 0) {
    const { origins, allowMethods, allowHeaders, credentials = true, maxAge = DEFAULT_CORS_MAX_AGE } = options.cors;
    http.use(
      cors({
        origin: [...origins],
        allowMethods: [...(allowMethods ?? DEFAULT_CORS_METHODS)],
        allowHeaders: [...(allowHeaders ?? DEFAULT_CORS_HEADERS)],
        credentials,
        maxAge,
      }),
    );
  }
  return http;
}
