import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { FrameworkEnv } from '../context';
import { tooManyRequests } from '../errors/http-error';

/**
 * Minimal fixed-window limiter contract. Satisfied structurally by
 * `@framework/cache`'s `RateLimiter` (memory or Redis), so this middleware
 * adds no dependency of its own.
 */
export interface ThrottleLimiter {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ readonly allowed: boolean; readonly retryAfterSeconds: number }>;
}

export interface ThrottleOptions {
  /**
   * Shared limiter, or a per-request resolver (e.g. `(c) => resolve(c,
   * RATE_LIMITER)` from `@framework/cache`) for middleware registered before
   * the container is booted.
   */
  readonly limiter: ThrottleLimiter | ((c: Context<FrameworkEnv>) => ThrottleLimiter);
  /** Allowed requests per window. */
  readonly limit: number;
  /** Window length in seconds; the counter is created with this TTL and never extended. */
  readonly windowSeconds: number;
  /** Key namespace, so independently mounted throttles never share a counter. */
  readonly prefix?: string;
  /** Disabled mounts a pass-through; config-driven so tests can turn it off. Default true. */
  readonly enabled?: boolean;
  /**
   * Counter key per request. Defaults to the first `x-forwarded-for` entry
   * (set by the trusted proxy in front of the app), falling back to a single
   * shared bucket for direct connections.
   */
  readonly keyFor?: (c: Context<FrameworkEnv>) => string;
}

const defaultKey = (c: Context<FrameworkEnv>): string => {
  const forwarded = c.req.header('x-forwarded-for');
  if (!forwarded) return 'direct';
  const [first] = forwarded.split(',');
  return first?.trim() || 'direct';
};

/**
 * Fixed-window request throttling (429 + `Retry-After` on exhaustion). Every
 * request counts — there is no per-route success reset; flows that should
 * reset on success (login) keep their dedicated limiter wiring. Limiter
 * failures propagate: a broken limiter denies requests instead of silently
 * bypassing the limit.
 */
export const throttle = (options: ThrottleOptions): MiddlewareHandler<FrameworkEnv> => {
  if (options.enabled === false) return createMiddleware<FrameworkEnv>(async (_c, next) => next());
  const prefix = options.prefix ?? 'throttle';
  const keyFor = options.keyFor ?? defaultKey;
  return createMiddleware<FrameworkEnv>(async (c, next) => {
    const limiter = typeof options.limiter === 'function' ? options.limiter(c) : options.limiter;
    const verdict = await limiter.consume(`${prefix}:${keyFor(c)}`, options.limit, options.windowSeconds);
    if (!verdict.allowed) {
      c.header('Retry-After', String(verdict.retryAfterSeconds));
      throw tooManyRequests();
    }
    await next();
  });
};
