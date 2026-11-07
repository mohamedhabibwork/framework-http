import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { FrameworkEnv } from '../context';
import { forbidden } from '../errors/http-error';
import { currentPrincipal } from './principal';

export type ResourceAbility =
  | 'viewAny'
  | 'view'
  | 'create'
  | 'audit'
  | 'update'
  | 'delete'
  | 'restore'
  | '*'
  | 'export'
  | 'import'
  | 'bulkDelete'
  | 'bulkCreate';

/**
 * Resource policy contract. Every ability must be implemented explicitly so
 * nothing becomes reachable by omission; `denyAll` is the default base.
 */
export type ResourcePolicy = Readonly<
  Record<ResourceAbility, (c: Context<FrameworkEnv>) => boolean | Promise<boolean>>
>;

export const denyAll: ResourcePolicy = {
  viewAny: () => false,
  view: () => false,
  create: () => false,
  update: () => false,
  delete: () => false,
  restore: () => false,
  '*': () => false,
  export: () => false,
  audit: () => false,
  import: () => false,
  bulkDelete: () => false,
  bulkCreate: () => false,
};

/** Route middleware that enforces one policy ability (403 on denial). */
export const authorize = (policy: ResourcePolicy, ability: ResourceAbility) =>
  createMiddleware<FrameworkEnv>(async (c, next) => {
    if (!(await policy[ability](c))) throw forbidden();
    await next();
  });

/**
 * Every ability requires an authenticated principal. Spread base for
 * resources generated with `access: authenticated` — still deny-by-default
 * for abilities an application does not override.
 */
export const authenticatedPolicy: ResourcePolicy = {
  viewAny: (c) => currentPrincipal(c) !== null,
  view: (c) => currentPrincipal(c) !== null,
  create: (c) => currentPrincipal(c) !== null,
  update: (c) => currentPrincipal(c) !== null,
  delete: (c) => currentPrincipal(c) !== null,
  restore: (c) => currentPrincipal(c) !== null,
  '*': (c) => currentPrincipal(c) !== null,
  export: (c) => currentPrincipal(c) !== null,
  audit: (c) => currentPrincipal(c) !== null,
  import: (c) => currentPrincipal(c) !== null,
  bulkDelete: (c) => currentPrincipal(c) !== null,
  bulkCreate: (c) => currentPrincipal(c) !== null,
};
