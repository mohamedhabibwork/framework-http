import { DEFAULT_HEALTH_TIMEOUT_MS, type HealthCheck, runHealthChecks } from '@framework/core';
import { Hono } from 'hono';
import type { FrameworkEnv } from '../context';

export interface HealthRoutesOptions {
  /** Readiness probes, e.g. `databaseHealthCheck()`, `cacheHealthCheck()`, `queueHealthCheck()`. */
  readonly checks?: readonly HealthCheck[];
  /** Default per-probe deadline in ms (a check's own `timeoutMs` wins). */
  readonly timeoutMs?: number;
}

/**
 * `GET /live` never touches dependencies; `GET /ready` runs every probe
 * concurrently in the request scope and answers 503 when any fails or times
 * out. Mount under a prefix: `.route('/health', healthRoutes({ checks }))`,
 * ahead of middleware with dependencies (a Redis-backed throttle), or an outage
 * fails the probes before they can answer.
 */
export function healthRoutes(options: HealthRoutesOptions = {}) {
  const checks = options.checks ?? [];
  const timeoutMs = options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  return new Hono<FrameworkEnv>()
    .get('/live', (c) => c.json({ status: 'ok' as const }))
    .get('/ready', async (c) => {
      const results = await runHealthChecks(checks, c.get('scope'), timeoutMs);
      const failed = results.some(([, status]) => status === 'failed');
      return c.json(
        { status: failed ? ('unavailable' as const) : ('ready' as const), checks: Object.fromEntries(results) },
        failed ? 503 : 200,
      );
    });
}
