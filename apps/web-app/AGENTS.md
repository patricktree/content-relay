# Web App Agent Instructions

## Scope

- Applies to `apps/web-app/**`.
- Follow root `AGENTS.md` for package manager, validation, testing, architecture, and commits.
- Load `content-relay-frontend` for browser UI work.
- Load `content-relay-architecture` when changing shared contracts, client APIs, or platform boundaries.

## Layout

- `src/app/**`: React UI, providers, forms, styling, and UI composition.
- `src/app/design-system/**`: reusable UI primitives such as `DSButton`.
- `src/app/form/**`: reusable TanStack Form wrappers and form controls.
- `src/data-fetching/**`: TanStack Query factories, hooks, mutations, keys, and cache synchronization. This is the app's data-fetching layer.
- `src/platform/**`: Capacitor/browser adapter code and native payload parsing.
- `test-e2e/**`: Playwright E2E tests.

## Local Conventions

- Use package imports such as `#src/...` and `#test-e2e/...`.
- Prefer `DSButton` over raw buttons for app UI.
- Use `useAppForm` and shared form components for forms.
- Keep Relay Hub queries/mutations in `src/data-fetching/**`.
- Keep Capacitor APIs and browser/native payload parsing in `src/platform/**`.

## Commands

- Final validation from repo root: `pnpm run fix`, then `pnpm run validate`.
- Debug E2E only: `pnpm --filter '@content-relay/web-app' test:e2e`.
- Update snapshots only for intentional visual changes: `pnpm --filter '@content-relay/web-app' test:e2e:update`.
