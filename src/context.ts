import type { Scope, ServiceValue, Token } from '@framework/core';
import type { Context } from 'hono';
import type { PrincipalLike } from './authorization/principal';

/** Context variables installed by the framework kernel. */
export type FrameworkVariables = {
  requestId: string;
  scope: Scope;
  /** Authenticated principal; set by an authentication layer, absent when anonymous. */
  principal?: PrincipalLike | null;
};

export type FrameworkEnv = { Variables: FrameworkVariables };

/** Resolves a service from the current request scope. */
export function resolve<T extends ServiceValue>(c: Context<FrameworkEnv>, dependency: Token<T>): T {
  return c.get('scope').resolve(dependency);
}
