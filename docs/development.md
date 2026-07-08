# Development

## Prerequisites

- **pnpm:** This monorepo uses [`pnpm`](https://pnpm.io/) as its package manager. The version is pinned in `package.json#packageManager`.
- **Node.js:** pnpm manages the Node.js version when commands run through `pnpm run` or `pnpm exec`. Use `pnpm exec node ...` for one-off Node.js commands that must use the repo runtime.
- **Toolchain for native Node.js modules:** Follow the "A C/C++ compiler tool chain for your platform" instructions in the [VS Code contribution prerequisites](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites).
- **Docker and Docker Compose:** Install via a local Docker environment such as [Docker Desktop](https://www.docker.com/products/docker-desktop/).

## Setup

```bash
pnpm install
```

## Common commands

Run commands from the monorepo root unless a package-specific runbook says otherwise.

```bash
pnpm run build
pnpm run dev
pnpm run lint
pnpm run test
pnpm run format:check
```

## Validation before handoff

Before handing changes off, run:

```bash
pnpm run fix
pnpm run validate
```

`pnpm run fix` runs formatting and autofixable linting. `pnpm run validate` runs build, lint, tests, and dependency/dead-code checks.
