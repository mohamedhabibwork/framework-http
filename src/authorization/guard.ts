import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { FrameworkEnv } from '../context';

/**
 * Endpoint authorization callback. Deny by throwing an `HttpError` (e.g.
 * `unauthenticated()` / `forbidden()`); returning normally grants access.
 */
export type RouteGuard = (c: Context<FrameworkEnv>) => void | Promise<void>;

/**
 * Mount-time authorization decision required by every guardable route family
 * (`workflowRoutes`, `auditRoutes`, `importExportRoutes`):
 *
 * - a {@link RouteGuard} that throws to deny,
 * - ready-made auth middleware (`requireAuth()`, `requireAbility(...)` from
 *   `@framework/auth`) — anything taking `(c, next)` runs as middleware, or
 * - the explicit `'public'` opt-out.
 *
 * There is no implicit default: an omitted callback is a compile error, so
 * unprotected admin endpoints are always a deliberate, greppable choice.
 */
export type MountAuthorization = RouteGuard | MiddlewareHandler<FrameworkEnv> | 'public';

/**
 * Converts a mount-time authorization into Hono middleware that runs before
 * validation, so anonymous callers receive 401/403 instead of schema
 * disclosure through 422 field errors.
 */
export const authorizationGuard = (authorize: MountAuthorization): MiddlewareHandler<FrameworkEnv> => {
  if (authorize === 'public') return createMiddleware<FrameworkEnv>(async (_c, next) => next());
  // Middleware-style guards manage the chain themselves; plain guards throw
  // to deny and this wrapper advances the chain when they pass.
  if (authorize.length >= 2) return authorize as MiddlewareHandler<FrameworkEnv>;
  const guard = authorize as RouteGuard;
  return createMiddleware<FrameworkEnv>(async (c, next) => {
    await guard(c);
    await next();
  });
};
