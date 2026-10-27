import {
  type Actor,
  ANONYMOUS_ACTOR,
  type Application,
  EXECUTION_CONTEXT,
  ExecutionContext,
  runWithExecution,
  token,
} from '@framework/core';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { FrameworkEnv } from '../context';

export interface RequestContext {
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
}

export const REQUEST_CONTEXT = token<RequestContext>('http.request-context');

/**
 * Creates one execution scope per request and disposes it after the handler
 * chain (including error responses produced by `onError`). Disposal failures
 * are reported, never turned into a 500 for an already-produced response.
 * Streaming handlers must not use scoped services after returning the stream.
 */
/** Resolves who is acting for a request (authentication plugs in here). */
export type ActorResolver = (c: Context<FrameworkEnv>) => Actor | Promise<Actor>;

export const requestScope = <TConfig extends object>(
  application: Application<TConfig>,
  resolveActor: ActorResolver = () => ANONYMOUS_ACTOR,
) =>
  createMiddleware<FrameworkEnv>(async (c, next) => {
    const scope = application.createScope('request');
    scope.override(REQUEST_CONTEXT, { requestId: c.get('requestId'), method: c.req.method, path: c.req.path });
    const execution = new ExecutionContext('request', c.get('requestId'), await resolveActor(c));
    scope.override(EXECUTION_CONTEXT, execution);
    c.set('scope', scope);
    try {
      // Ambient execution context: helpers (`correlationId()`, `logger()`, …)
      // see this request's actor/correlation id anywhere in the chain.
      await runWithExecution(execution, () => next());
    } finally {
      await scope.dispose().catch((error: Error) => console.error('[http] request scope disposal failed', error));
    }
  });
