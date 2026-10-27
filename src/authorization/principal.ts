import type { Context } from 'hono';
import type { FrameworkEnv } from '../context';

/**
 * Minimal identity contract installed on the request context by an
 * authentication layer (e.g. `@framework/auth`). `@framework/http` only needs
 * to know an identity exists and which coarse abilities it carries; guards,
 * sessions and tokens stay in the auth package.
 */
export interface PrincipalLike {
  readonly id: string;
  readonly abilities: readonly string[];
}

/** Reads the authenticated principal for the request, or null when anonymous. */
export function currentPrincipal(c: Context<FrameworkEnv>): PrincipalLike | null {
  // Hono's `get` overloads lose the variable type for optional keys; assert it back.
  return (c.get('principal') as PrincipalLike | null | undefined) ?? null;
}

/** True when the principal's abilities grant `ability` (`*` grants all). */
export function hasAbility(principal: PrincipalLike, ability: string): boolean {
  return principal.abilities.includes('*') || principal.abilities.includes(ability);
}
