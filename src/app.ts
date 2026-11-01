import { Application, type Container, FrameworkError, type ServiceProvider } from '@framework/core';
import type { Hono } from 'hono';
import type { FrameworkEnv } from './context';
import { createHttpKernel, type HttpKernelOptions } from './kernel';
import { type HealthRoutesOptions, healthRoutes } from './routing/health';
import { assertNoDuplicateRoutes } from './routing/routes';

/**
 * One feature, registered in one place: its providers, its routes (mounted
 * under the app's API prefix) and its documented operations.
 */
export interface AppModule<TConfig extends object, TOperation = never> {
  readonly name: string;
  readonly providers?: readonly ServiceProvider<TConfig>[];
  readonly routes?: { readonly path: string; readonly app: Hono<FrameworkEnv> };
  /** OpenAPI operations (e.g. `@framework/openapi`'s `Operation`), collected in module order. */
  readonly operations?: readonly TOperation[];
}

/** Identity helper keeping module type inference at the definition site. */
export const defineModule = <TConfig extends object, TOperation = never>(
  module: AppModule<TConfig, TOperation>,
): AppModule<TConfig, TOperation> => module;

export interface DefineAppOptions<TConfig extends object, TOperation = never> {
  /** Kernel options derived from the validated config. */
  readonly http: (config: TConfig) => HttpKernelOptions;
  /** App-level providers (framework packages, shared infrastructure). */
  readonly providers?: readonly ServiceProvider<TConfig>[];
  readonly modules?: readonly AppModule<TConfig, TOperation>[];
  /**
   * Replace or decorate any binding (`container.override` / `extend`). Runs
   * before providers register; overrides win regardless of order.
   */
  readonly overrides?: (container: Container, config: TConfig) => void;
  /** Where module routes mount. Defaults to `/api/v1`. */
  readonly apiPrefix?: string;
  /** `/health` routes; `false` disables them. Defaults to liveness plus no readiness probes. */
  readonly health?: HealthRoutesOptions | false;
  /** App-level routes and middleware beyond modules (audit, WebSocket gateway, …). */
  readonly routes?: (http: Hono<FrameworkEnv>, application: Application<TConfig>) => void;
}

export interface AppDefinition<TConfig extends object, TOperation = never> {
  /** App providers followed by every module's providers. */
  readonly providers: readonly ServiceProvider<TConfig>[];
  /** Every module's operations, in module order. */
  readonly operations: readonly TOperation[];
  /** A new, unbooted application with overrides applied. */
  createApplication(config: TConfig): Application<TConfig>;
  /** The kernel with health, module and app routes; refuses duplicate routes. */
  createHttp(application: Application<TConfig>): Hono<FrameworkEnv>;
}

const DEFAULT_API_PREFIX = '/api/v1';

function assertUniqueModules(modules: readonly { readonly name: string }[]): void {
  const seen = new Set<string>();
  for (const { name } of modules) {
    if (seen.has(name)) throw new FrameworkError('DUPLICATE_MODULE', `Module "${name}" is registered twice`);
    seen.add(name);
  }
}

/**
 * Composes an application from providers and modules — what a generated app's
 * `bootstrap/app.ts`, `bootstrap/http.ts` and `bootstrap/openapi.ts` wire by
 * hand. Every part stays replaceable: `overrides` for bindings, `http` for
 * kernel options, `routes` for anything else.
 */
export function defineApp<TConfig extends object, TOperation = never>(
  options: DefineAppOptions<TConfig, TOperation>,
): AppDefinition<TConfig, TOperation> {
  const modules = options.modules ?? [];
  assertUniqueModules(modules);
  const providers = [...(options.providers ?? []), ...modules.flatMap((module) => module.providers ?? [])];
  const apiPrefix = options.apiPrefix ?? DEFAULT_API_PREFIX;

  return {
    providers,
    operations: modules.flatMap((module) => module.operations ?? []),
    createApplication(config) {
      const application = new Application<TConfig>({ config, providers });
      options.overrides?.(application.container, config);
      return application;
    },
    createHttp(application) {
      const http = createHttpKernel(application, options.http(application.config));
      if (options.health !== false) http.route('/health', healthRoutes(options.health ?? {}));
      for (const module of modules) {
        if (module.routes) http.route(`${apiPrefix}${module.routes.path}`, module.routes.app);
      }
      options.routes?.(http, application);
      assertNoDuplicateRoutes(http);
      return http;
    },
  };
}
