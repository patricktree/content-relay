---
name: content-relay-architecture
description: Applies Content Relay architecture conventions. Use when work crosses app/lib boundaries, shared contracts, client APIs, native platform adapters, Relay Hub behavior, package placement, TypeScript project boundaries, or Clean Architecture decisions.
---

# Content Relay Architecture

Use this skill when a Content Relay change crosses module, package, or platform boundaries.

## First Actions

1. Load the `clean-architecture` skill.
2. Read repo root `../../../AGENTS.md` for required skills and validation.
3. Read repo root `../../../docs/architecture.md` for the canonical project architecture rules.
4. Read repo root `../../../CONTEXT.md` before naming domain objects or user-facing behavior.

## Boundary Checklist

- Keep domain and application logic independent from frameworks, UI, persistence, native APIs, and transport details.
- Put shared contracts and cross-package types in `../../../libs/contracts`.
- Keep framework, native, CLI, HTTP, filesystem, database, and SDK code in adapters or drivers.
- Validate external data at trust boundaries before passing it inward.
- Pass plain parsed application values across boundaries, not raw framework objects, SDK payloads, or storage rows.
- Preserve explicit `.ts` imports and existing solution-style TypeScript project references.

## Package Placement

| If adding or changing...                     | Prefer...                                                   |
| -------------------------------------------- | ----------------------------------------------------------- |
| Shared request/response contracts or schemas | `../../../libs/contracts`                                   |
| Relay Hub behavior                           | Relay Hub application/domain code plus adapters at the edge |
| Browser UI behavior                          | Load `content-relay-frontend` and follow app-local guidance |
| Test helpers used across packages            | Existing `../../../qa-utils/*` helpers before new utilities |
| Workspace build/lint/type config             | Dedicated `../../../tooling/config-*` packages              |

## Completion Checklist

- Dependency direction still points inward toward domain/application policy.
- Cross-boundary data is validated and mapped at the edge.
- User-facing terminology matches repo root `../../../CONTEXT.md`.
- Validation uses repo root commands from `../../../AGENTS.md`: `pnpm run fix`, then `pnpm run validate`.
