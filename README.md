# content-relay

Headless-first content relay for sending text, URLs, and file bundles between personal devices over a Tailnet-hosted server.

## Status

This repository is in the initial scaffold phase.

Current implementation:

- monorepo wiring with `pnpm` + Turborepo
- shared TypeScript and ESLint configs
- placeholder packages for:
  - `@content-relay/backend`
  - `@content-relay/cli`
  - `@content-relay/shared`
- a minimal `relay` CLI entrypoint that currently prints `cli ready`

Product behavior, architecture, and CLI requirements are defined in `docs/` and should be treated as the source of truth while implementation catches up.

## What this project is for

`content-relay` is a personal cross-device system for sending:

- text
- URLs
- one or more files as a single logical item

Target clients planned in v1:

- Android via an installable PWA
- iOS via a native React Native app
- macOS via a native menu bar app
- a CLI for headless development, testing, and protocol validation

The server is intended to run on a Raspberry Pi inside a Tailnet. Delivery is pull-based and at-least-once, with the server acting as the source of truth.

## Repository layout

```text
.
├── docs/
│   ├── 00-PLAN.md
│   ├── 01-TECH-DECISIONS.md
│   └── 02-CLI-SPEC.md
├── packages/
│   ├── backend/
│   ├── cli/
│   ├── shared/
│   ├── config-eslint/
│   └── config-typescript/
├── package.json
├── pnpm-workspace.yaml
└── turbo.jsonc
```

### Packages

- `packages/backend` — future Node.js/TypeScript server
- `packages/cli` — future `relay` CLI
- `packages/shared` — shared contracts and types
- `packages/config-eslint` — shared ESLint config
- `packages/config-typescript` — shared TypeScript config

## Architecture direction

The project is intentionally planned around strict ports-and-adapters / Clean Architecture boundaries.

High-level layers:

- `domain` — entities and value objects
- `application` — use cases
- `ports` — repository and infrastructure interfaces
- `infrastructure` — SQLite, filesystem blobs, auth, push, HTTP adapters
- `interfaces` — CLI, HTTP handlers, native app integrations

Important planned choices:

- runtime: Node.js
- language: TypeScript
- HTTP framework: Hono
- validation/contracts: Zod
- metadata storage: SQLite
- query layer: Drizzle
- blob storage: filesystem
- timestamps: `Temporal` via `temporal-polyfill`
- CLI framework: `commander`

See `docs/01-TECH-DECISIONS.md` for the full rationale and constraints.

## Development prerequisites

- Node.js `^24.15.0` recommended locally
- `pnpm` `10.33.2`
- Corepack enabled

## Getting started

```bash
corepack enable
pnpm install
pnpm build
```

## Workspace commands

From the repo root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm clean
```

### Package-specific commands

```bash
pnpm --filter @content-relay/cli build
pnpm --filter @content-relay/backend build
pnpm --filter @content-relay/shared build
```

## Validation

Current pre-commit checks:

```bash
pnpm run format:check
pnpm run lint
pnpm run build
```

## Key project documents

- `docs/00-PLAN.md` — product scope, platform behavior, milestones, API sketch
- `docs/01-TECH-DECISIONS.md` — concrete technology choices and architectural boundaries
- `docs/02-CLI-SPEC.md` — required CLI UX and protocol semantics for `relay`

## Immediate implementation focus

The planned first vertical slice is:

1. backend foundation
2. invite + device registration
3. item creation and delivery tracking
4. reusable headless client core
5. CLI support for send / receive / ack / viewed / download flows

That milestone is described in `docs/00-PLAN.md` and the CLI contract in `docs/02-CLI-SPEC.md`.
