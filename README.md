# content-relay

Headless-first content relay for sending text, URLs, and file bundles between personal devices over a Tailnet-hosted server.

## Status

Milestone 0 is implemented:

- `relay-server` starts the real backend with SQLite metadata storage and filesystem blob storage
- invite creation and device registration work against the real server
- per-device token auth is enforced on item, delivery, and device endpoints
- `relay` implements the headless CLI contract for device management, send, receive, ack, viewed, open, download, and inspection flows
- a reusable headless client core and local device-profile store live in `@content-relay/shared`
- end-to-end tests exercise the real server flow for registration, multi-target send, receive, viewed transitions, deduplication, and multi-file download

The `docs/` files remain the source of truth for behavior and architecture.

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

Start the backend:

```bash
pnpm --filter backend exec relay-server --port 4000 --data-dir ./.relay-data
```

Create an invite and register devices through the implemented HTTP + CLI flow. For example, once the server is running you can create an invite with `curl` and then register a CLI device:

```bash
INVITE=$(curl -s http://127.0.0.1:4000/invites \
  -H 'content-type: application/json' \
  -d '{"expiresInSeconds":900}' | jq -r '.inviteCode')

relay --server http://127.0.0.1:4000 device register \
  --name "Developer CLI" \
  --platform cli \
  --invite "$INVITE"
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
pnpm test
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
pnpm run test
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
