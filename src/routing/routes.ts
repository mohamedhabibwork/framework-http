import { FrameworkError } from '@framework/core';

/** Structural subset of Hono's `app.routes`, independent of the app's Env generic. */
interface RouteTable {
  readonly routes: readonly { readonly method: string; readonly path: string; readonly handler?: unknown }[];
}

export interface RouteInfo {
  readonly method: string;
  readonly path: string;
  /** Handlers (route middleware + final handler) registered for this method/path. */
  readonly handlers: number;
}

/** Lists endpoint routes (excluding `use()` middleware entries) in registration order. */
export function listRoutes(app: RouteTable): RouteInfo[] {
  const routes = new Map<string, RouteInfo>();
  for (const route of app.routes) {
    if (route.method === 'ALL') continue;
    const key = `${route.method} ${route.path}`;
    routes.set(key, { method: route.method, path: route.path, handlers: (routes.get(key)?.handlers ?? 0) + 1 });
  }
  return [...routes.values()];
}

/**
 * Hono records one table entry per handler, so a single `app.get(path, mw, h)`
 * produces a contiguous run of distinct handler references for one
 * method+path. Two signals catch duplicate registrations:
 *
 * 1. a method+path that appears in two separate *runs* was registered twice
 *    by different modules (the original check), and
 * 2. the same handler function object appearing twice inside one run —
 *    impossible in a legitimate registration, where every handler in the
 *    chain is a distinct function — catches the previously blind spot of a
 *    sub-app (or handler) mounted twice back to back.
 *
 * Remaining limitation: two consecutive registrations with *different*
 * handler functions are indistinguishable from one registration with two
 * handlers — both produce adjacent entries with distinct references.
 */
export function assertNoDuplicateRoutes(app: RouteTable): void {
  const runs = new Map<string, number>();
  const seenInRun = new Set<unknown>();
  let previous = '';
  for (const route of app.routes) {
    const key = `${route.method} ${route.path}`;
    if (route.method !== 'ALL') {
      if (key !== previous) {
        runs.set(key, (runs.get(key) ?? 0) + 1);
        seenInRun.clear();
      } else if (route.handler !== undefined && seenInRun.has(route.handler)) {
        throw new FrameworkError('DUPLICATE_ROUTE', `Duplicate route registrations: ${key}`);
      }
      if (route.handler !== undefined) seenInRun.add(route.handler);
    }
    previous = key;
  }
  const duplicates = [...runs.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicates.length > 0) {
    throw new FrameworkError('DUPLICATE_ROUTE', `Duplicate route registrations: ${duplicates.join(', ')}`);
  }
}
