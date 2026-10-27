# @framework/http

Hono HTTP kernel, structured errors, request scope, middleware registry, and authorization policies.

> **Read-only subtree split** — This package is developed inside the main [**mohamedhabibwork/framework**](https://github.com/mohamedhabibwork/framework/tree/main/packages/http) monorepo and automatically synced to [`mohamedhabibwork/framework-http`](https://github.com/mohamedhabibwork/framework-http). Please open issues and pull requests in the main framework repository.

## Ecosystem Links

- **Main Framework Repository**: [mohamedhabibwork/framework](https://github.com/mohamedhabibwork/framework)
- **Package Repository**: [mohamedhabibwork/framework-http](https://github.com/mohamedhabibwork/framework-http)
- **Starter Application Template**: [mohamedhabibwork/framework-app](https://github.com/mohamedhabibwork/framework-app)
- **Documentation Repository**: [mohamedhabibwork/framework-docs](https://github.com/mohamedhabibwork/framework-docs)
- **Documentation Site**: [https://framework.habib.cloud](https://framework.habib.cloud)

## Installation

### Inside a Standalone App (via GitHub)

```json
{
  "dependencies": {
    "@framework/http": "github:mohamedhabibwork/framework-http"
  }
}
```

```sh
bun install
```

### Creating a New Application

Use the starter application template repository to bootstrap a full application with all framework packages pre-wired:

```sh
gh repo create my-api --template mohamedhabibwork/framework-app --clone
cd my-api
bun install
```

## License

MIT
