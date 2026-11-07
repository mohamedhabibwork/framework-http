import { createMiddleware } from 'hono/factory';
import type { FrameworkEnv } from '../context';
import { unauthenticated } from '../errors/http-error';
import { currentPrincipal } from './principal';

/**
 * Route middleware rejecting anonymous requests (401). Authentication itself
 * happens earlier — the kernel's `resolveActor` hook — so this only checks
 * the principal the auth layer installed.
 */
export const requireAuth = () =>
  createMiddleware<FrameworkEnv>(async (c, next) => {
    if (!currentPrincipal(c)) throw unauthenticated();
    await next();
  });
