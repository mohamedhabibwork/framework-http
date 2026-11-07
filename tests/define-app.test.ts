import { describe, expect, test } from 'bun:test';
import { defineHealthCheck, defineProvider, token } from '@framework/core';
import { Hono } from 'hono';
import { defineApp, defineModule, type FrameworkEnv, resolve } from '../src';

type Config = { readonly greeting: string };
interface Operation {
  readonly path: string;
}

const Greeter = token<{ greet(): string }>('greeter');

const greetingsModule = defineModule<Config, Operation>({
  name: 'greetings',
  providers: [
    defineProvider<Config>({
      name: 'greetings',
      register: ({ container, config }) => void container.singleton(Greeter, () => ({ greet: () => config.greeting })),
    }),
  ],
  routes: {
    path: '/greetings',
    app: new Hono<FrameworkEnv>().get('/', (c) => c.json({ message: resolve(c, Greeter).greet() })),
  },
  operations: [{ path: '/api/v1/greetings' }],
});

const statusModule = defineModule<Config, Operation>({
  name: 'status',
  routes: { path: '/status', app: new Hono<FrameworkEnv>().get('/', (c) => c.json({ up: true })) },
  operations: [{ path: '/api/v1/status' }],
});

const kernel = { exposeInternalErrors: false } as const;

async function serve<TOperation>(definition: ReturnType<typeof defineApp<Config, TOperation>>) {
  const application = await definition.createApplication({ greeting: 'hello' }).boot();
  return definition.createHttp(application);
}

describe('defineApp', () => {
  test('registers module providers, mounts module routes under the API prefix and collects operations', async () => {
    const app = defineApp<Config, Operation>({ http: () => kernel, modules: [greetingsModule, statusModule] });
    const http = await serve(app);

    expect(await (await http.request('/api/v1/greetings')).json()).toEqual({ message: 'hello' });
    expect(await (await http.request('/api/v1/status')).json()).toEqual({ up: true });
    expect(app.operations).toEqual([{ path: '/api/v1/greetings' }, { path: '/api/v1/status' }]);
    expect(app.providers.map((provider) => provider.name)).toEqual(['greetings']);
  });

  test('overrides replace a module binding regardless of registration order', async () => {
    const app = defineApp<Config, Operation>({
      http: () => kernel,
      modules: [greetingsModule],
      overrides: (container, config) =>
        void container.override(Greeter, () => ({ greet: () => `${config.greeting}, overridden` })),
    });
    const http = await serve(app);

    expect(await (await http.request('/api/v1/greetings')).json()).toEqual({ message: 'hello, overridden' });
  });

  test('mounts /health with the given checks, or not at all', async () => {
    const withHealth = await serve(
      defineApp<Config, Operation>({
        http: () => kernel,
        health: { checks: [defineHealthCheck('greeter', async (r) => void r.resolve(Greeter).greet())] },
        modules: [greetingsModule],
      }),
    );
    expect(await (await withHealth.request('/health/ready')).json()).toEqual({
      status: 'ready',
      checks: { greeter: 'ok' },
    });

    const withoutHealth = await serve(defineApp<Config, Operation>({ http: () => kernel, health: false }));
    expect((await withoutHealth.request('/health/live')).status).toBe(404);
  });

  test('a custom prefix and the routes hook mount app-level routes', async () => {
    const http = await serve(
      defineApp<Config, Operation>({
        http: () => kernel,
        apiPrefix: '/api/v2',
        modules: [statusModule],
        routes: (root, application) =>
          void root.get('/about', (c) => c.json({ greeting: application.config.greeting })),
      }),
    );

    expect((await http.request('/api/v2/status')).status).toBe(200);
    expect(await (await http.request('/about')).json()).toEqual({ greeting: 'hello' });
  });

  test('health routes answer even when app middleware fails, and keep the kernel headers', async () => {
    const http = await serve(
      defineApp<Config, Operation>({
        http: () => kernel,
        middleware: () => [
          async () => {
            throw new Error('rate limiter unavailable');
          },
        ],
      }),
    );

    const live = await http.request('/health/live');

    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'ok' });
    expect(live.headers.get('x-request-id')).toBeTruthy();
    expect((await http.request('/health/ready')).status).toBe(200);
    expect((await http.request('/api/v1/nope')).status).toBe(500);
  });

  test('app middleware runs before module and app routes, but not health', async () => {
    const http = await serve(
      defineApp<Config, Operation>({
        http: () => kernel,
        middleware: (config) => [
          async (c, next) => {
            await next();
            c.res.headers.set('x-greeting', config.greeting);
          },
        ],
        modules: [statusModule],
        routes: (root) => void root.get('/about', (c) => c.json({})),
      }),
    );

    for (const path of ['/api/v1/status', '/about']) {
      expect((await http.request(path)).headers.get('x-greeting')).toBe('hello');
    }
    for (const path of ['/health/live', '/health/ready']) {
      expect((await http.request(path)).headers.get('x-greeting')).toBeNull();
    }
  });

  test('duplicate module names and colliding routes fail clearly', async () => {
    expect(() => defineApp<Config, Operation>({ http: () => kernel, modules: [statusModule, statusModule] })).toThrow(
      /Module "status" is registered twice/,
    );

    const clash = defineModule<Config, Operation>({ ...statusModule, name: 'status-copy' });
    const app = defineApp<Config, Operation>({ http: () => kernel, modules: [statusModule, clash] });
    const application = await app.createApplication({ greeting: 'hello' }).boot();
    expect(() => app.createHttp(application)).toThrow(/Duplicate route/i);
  });
});
