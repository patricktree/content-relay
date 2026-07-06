---
name: content-relay-frontend
description: Applies Content Relay frontend web-development conventions. Use before editing browser UI code that involves React, Vite, TanStack Query, TanStack Form, Linaria styled components, Base UI components, browser storage, Capacitor/browser adapters, or Playwright/Vitest frontend tests.
---

# Content Relay Frontend

Use this skill for browser-based frontend work in Content Relay.

## First Actions

1. Read repo root `../../../AGENTS.md` and follow its validation rules.
2. Load `content-relay-architecture` before making cross-boundary changes.
3. Read repo root `../../../CONTEXT.md` when naming domain objects or user-facing behavior.
4. Inspect the nearest existing frontend files before adding new patterns.

## Reference Routing

| Open when working on...                                   | Read                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| Cross-boundary architecture, contracts, adapters          | Load `content-relay-architecture`                                   |
| React components, state, effects, Suspense                | `references/react.md`                                               |
| TanStack Query query factories, mutations, cache updates  | `references/tanstack-query.md`                                      |
| Linaria, styled components, design tokens, global styles  | `references/linaria-styling.md`                                     |
| Vitest, Playwright, visual snapshots, frontend validation | Load `content-relay-testing`; read `references/frontend-testing.md` |

## General Frontend Rules

- Keep UI code focused on rendering, interaction, form state, and presentation.
- Keep data-fetching modules focused on query keys, query factories, mutations, and cache synchronization.
- Keep browser/native adapters focused on platform APIs and validation of platform payloads.
- Prefer extending existing primitives before introducing parallel abstractions.
- Validate data at trust boundaries with `zod` or shared contract schemas.
- Pass parsed app-level values into UI code instead of raw external payloads.
- Follow `content-relay-testing` when choosing test level; prefer integration tests before E2E tests unless the behavior needs full browser wiring.

## Current Web App: `../../../apps/web-app`

- Read `../../../apps/web-app/AGENTS.md` before changing files under `../../../apps/web-app/**`.
- Treat `../../../apps/web-app/AGENTS.md` as the source of truth for app-local layout, imports, commands, and testing notes.
- Keep this skill focused on frontend conventions that should survive future web app reshapes.

## Discouraged

- Do not fetch or mutate Relay Hub data directly from arbitrary JSX-heavy components; put queries and mutation hooks in data-fetching code.
- Do not pass raw Capacitor plugin payloads, `localStorage` strings, or network response shapes deep into React components.
- Do not add component-specific rules to global CSS.
- Do not duplicate schemas that already exist in `@content-relay/contracts`.
- Do not use React context for local form state or one-component state.

## Completion Checklist

- Relevant reference files above were read for the touched area.
- User-facing terminology matches repo root `../../../CONTEXT.md`.
- Validation uses repo root commands from `../../../AGENTS.md`: `pnpm run fix`, then `pnpm run validate`.
