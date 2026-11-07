import { describe, expect, test } from 'bun:test';
import { Application, defineHealthCheck, token } from '@framework/core';
import { createHttpKernel, healthRoutes } from '../src';

const Probe = token<{ ping(): Promise<void> }>('probe-target');

async function kernelWith(checks: Parameters<typeof healthRoutes>[0]) {
  const app = new Application<object>({ config: {}, providers: [] });
  app.container.value(Probe, { ping: async () => {} });
  await app.boot();
  return createHttpKernel(app, { exposeInternalErrors: false }).route('/health', healthRoutes(checks));
}

describe('healthRoutes', () => {
  test('liveness answers without running any probe', async () => {
    let probed = false;
    const http = await kernelWith({
      checks: [defineHealthCheck('database', async () => void (probed = true))],
    });

    const response = await http.request('/health/live');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(probed).toBe(false);
  });

  test('readiness is 200 when every probe passes and probes resolve from the request scope', async () => {
    const http = await kernelWith({
      checks: [defineHealthCheck('database', (resolver) => resolver.resolve(Probe).ping())],
    });

    const response = await http.request('/health/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready', checks: { database: 'ok' } });
  });

  test('a failing probe makes readiness 503 without leaking the error', async () => {
    const http = await kernelWith({
      checks: [
        defineHealthCheck('database', async () => {}),
        defineHealthCheck('cache', async () => {
          throw new Error('redis://user:hunter2@cache refused');
        }),
      ],
    });

    const response = await http.request('/health/ready');
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: 'unavailable', checks: { database: 'ok', cache: 'failed' } });
    expect(body).not.toContain('hunter2');
  });

  test('a hanging probe fails at its timeout instead of stalling readiness', async () => {
    const http = await kernelWith({
      timeoutMs: 1_000,
      checks: [
        defineHealthCheck('queue', () => new Promise<void>(() => {}), { timeoutMs: 20 }),
        defineHealthCheck('database', async () => {}),
      ],
    });

    const started = performance.now();
    const response = await http.request('/health/ready');
    expect(performance.now() - started).toBeLessThan(500);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', checks: { queue: 'failed', database: 'ok' } });
  });

  test('no checks means ready', async () => {
    const http = await kernelWith({});
    const response = await http.request('/health/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready', checks: {} });
  });
});
