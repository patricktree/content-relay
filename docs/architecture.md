# Architecture

Content Relay follows strict ports-and-adapters / Clean Architecture boundaries. Keep domain and application logic independent from UI frameworks, native platform APIs, persistence details, and network transports.

## Core rules

- Preserve dependency direction toward domain and application code.
- Keep business rules out of React components, CLI entrypoints, HTTP handlers, native adapters, database adapters, and SDK glue.
- Validate data at trust boundaries before passing it inward.
- Pass plain, parsed application values across boundaries instead of framework objects or raw external payloads.
- Put shared contracts and cross-package types in `libs/contracts`.
- Keep workspace-level TypeScript, lint, test configuration in dedicated `tooling/config-*` packages.
- Follow the existing ESM + native TypeScript pattern, including explicit `.ts` imports.
- Default to solution-style TypeScript setup: `tsconfig.json` references `tsconfig.build.json` and `tsconfig.tests.json`.

## Layer ownership

| Layer                  | Owns                                                                 | Avoids                                                  |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Domain                 | Core product concepts and invariants                                 | Framework, storage, transport, and platform APIs        |
| Application            | Use cases, orchestration, ports, authorization decisions             | UI rendering, HTTP parsing, database rows, SDK payloads |
| Interface adapters     | Mapping between external shapes and application models               | Business rules that belong to use cases                 |
| Frameworks and drivers | Concrete web, native, CLI, database, filesystem, and SDK integration | Domain policy                                           |

## Product language

Use `CONTEXT.md` as the source of truth for domain terminology. Prefer terms like **Relay Hub**, **Device**, **Item**, **File Item**, and **Delivery** over generic alternatives such as backend, client, message, or payload.

## Testing expectations

Prefer tests in this order:

1. Integration tests for package boundaries, adapter seams, and cross-module behavior.
2. E2E tests for user-visible behavior and full wiring across surfaces.
3. Unit tests only for critical code paths or code that is difficult to reach through integration or E2E tests.

Follow existing test layout and naming, for example `test/e2e-*.test.ts`.
