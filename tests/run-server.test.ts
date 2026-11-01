import { describe, expect, test } from 'bun:test';
import { Application, defineProvider } from '@framework/core';
import { createHttpKernel, healthRoutes, runServer } from '../src';

describe('runServer', () => {
  test('serves the kernel, then stop drains the server and shuts the application down once', async () => {
    const events: string[] = [];
    const app = new Application<object>({
      config: {},
      providers: [defineProvider({ name: 'probe', register: () => {}, shutdown: () => void events.push('shutdown') })],
    });
    await app.boot();
    const http = createHttpKernel(app, { exposeInternalErrors: false }).route('/health', healthRoutes({}));

    const running = runServer({ application: app, fetch: http.fetch, hostname: '127.0.0.1', port: 0, signals: false });

    const response = await fetch(new URL('/health/live', running.url));
    expect(response.status).toBe(200);

    await running.stop();
    await running.stop();
    expect(app.state).toBe('stopped');
    expect(events).toEqual(['shutdown']);
    await expect(fetch(new URL('/health/live', running.url))).rejects.toThrow();
  });
});
