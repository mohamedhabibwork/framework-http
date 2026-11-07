import { type Application, installGracefulShutdown } from '@framework/core';
import type { websocket } from 'hono/bun';

export interface RunServerOptions {
  /** A booted application; `stop()` shuts it down after the server drains. */
  readonly application: Pick<Application, 'shutdown'>;
  readonly fetch: (request: Request) => Response | Promise<Response>;
  readonly hostname: string;
  readonly port: number;
  /** Bun WebSocket handler, e.g. `websocket` from `@framework/events`. */
  readonly websocket?: typeof websocket;
  /** Drain deadline for SIGTERM/SIGINT. Defaults to 10s. */
  readonly shutdownTimeoutMs?: number;
  /** `false` skips SIGTERM/SIGINT handlers (tests, embedding). Defaults to true. */
  readonly signals?: boolean;
  /** Startup and shutdown messages. Defaults to stderr. */
  readonly log?: (message: string) => void;
}

export interface RunningServer {
  readonly url: URL;
  /** Stops accepting connections, drains, then shuts the application down. Idempotent. */
  stop(): Promise<void>;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Serves an HTTP kernel with graceful shutdown — the whole of a generated
 * `bin/server.ts`:
 *
 * ```ts
 * runServer({ application, fetch: http.fetch, hostname: config.http.host, port: config.http.port, websocket });
 * ```
 */
export function runServer(options: RunServerOptions): RunningServer {
  const log = options.log ?? ((message: string) => console.error(message));
  const listen = { hostname: options.hostname, port: options.port, fetch: options.fetch };
  // Two calls: Bun.serve's overloads reject an optional `websocket` key.
  const server = options.websocket ? Bun.serve({ ...listen, websocket: options.websocket }) : Bun.serve(listen);
  log(`[server] listening on ${server.url.href}`);

  let uninstallSignals: (() => void) | undefined;
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      uninstallSignals?.();
      await server.stop();
      await options.application.shutdown();
    })();
    return stopping;
  };

  if (options.signals !== false) {
    uninstallSignals = installGracefulShutdown({
      timeoutMs: options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
      onShutdown: stop,
      log,
    });
  }
  return { url: server.url, stop };
}
