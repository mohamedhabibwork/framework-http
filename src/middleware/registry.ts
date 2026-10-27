import { FrameworkError } from '@framework/core';
import type { MiddlewareHandler } from 'hono';

export interface MiddlewareDescription {
  readonly name: string;
  readonly kind: 'alias' | 'group';
  readonly members?: readonly string[];
}

/**
 * Optional Laravel-style aliases and groups. Resolution happens at bootstrap,
 * so unknown names fail before any request is served. Declared order is kept.
 */
export class MiddlewareRegistry {
  readonly #aliases = new Map<string, MiddlewareHandler>();
  readonly #groups = new Map<string, readonly string[]>();

  alias(name: string, handler: MiddlewareHandler): this {
    this.#assertFree(name);
    this.#aliases.set(name, handler);
    return this;
  }

  group(name: string, members: readonly string[]): this {
    this.#assertFree(name);
    this.#groups.set(name, [...members]);
    return this;
  }

  /** Expands aliases and (nested) groups into an ordered handler list. */
  resolve(names: readonly string[]): MiddlewareHandler[] {
    return names.flatMap((name) => this.#expand(name, []));
  }

  /** Validates every group member eagerly; call during bootstrap. */
  validate(): void {
    for (const name of this.#groups.keys()) this.#expand(name, []);
  }

  describe(): MiddlewareDescription[] {
    return [
      ...[...this.#aliases.keys()].map((name) => ({ name, kind: 'alias' as const })),
      ...[...this.#groups.entries()].map(([name, members]) => ({ name, kind: 'group' as const, members })),
    ];
  }

  #expand(name: string, path: readonly string[]): MiddlewareHandler[] {
    if (path.includes(name)) {
      throw new FrameworkError('MIDDLEWARE_GROUP_CYCLE', `Middleware group cycle: ${[...path, name].join(' -> ')}`);
    }
    const handler = this.#aliases.get(name);
    if (handler) return [handler];
    const members = this.#groups.get(name);
    if (members) return members.flatMap((member) => this.#expand(member, [...path, name]));
    throw new FrameworkError('UNKNOWN_MIDDLEWARE', `Unknown middleware alias or group "${name}"`);
  }

  #assertFree(name: string): void {
    if (this.#aliases.has(name) || this.#groups.has(name)) {
      throw new FrameworkError('DUPLICATE_MIDDLEWARE', `Middleware "${name}" is already registered`);
    }
  }
}
