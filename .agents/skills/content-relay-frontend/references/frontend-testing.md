# Frontend Testing

## Test Strategy

- Prefer Playwright E2E tests for user-visible web app behavior.
- Use Vitest for small pure logic units when E2E coverage would be indirect or expensive.
- Test through the shared client and Relay Hub test utilities when behavior crosses the app/server boundary.
- Keep tests named by observable behavior, not implementation details.

## Playwright Patterns

- Put E2E tests under `apps/web-app/test-e2e/**`.
- Use `test` from `#test-e2e/globals.ts`.
- Use helpers from `#test-e2e/helpers.ts` for app preparation and navigation.
- Never use CSS selectors for interactive elements.
- Use accessible/user-facing locators for interactive elements, such as role/name, label text, visible text, or alt text.
- If an interactive element is not locatable that way, change the UI code so it has the right accessible semantics or user-facing label.
- Preserve accessible names that existing tests depend on.
- Use `withRelayHubTestEnvironment` and seeding helpers for realistic Relay Hub interactions.

## Visual Snapshots

- Keep screenshot tests deterministic.
- Wait for fonts via the existing navigation helper before screenshots.
- Playwright snapshots are Docker-stable by default; update snapshots only for intentional visual changes.
- Explain intentional visual snapshot changes in handoff.

## Failure Tests

- Cover validation failures, backend failures, and platform unavailable behavior when they affect user-visible flows.
- Assert that success notifications and persisted state do not appear after failed operations.
- Prefer route interception for backend failure cases already covered by E2E tests.

## Commands

- Normal handoff from repo root: `pnpm run fix`, then `pnpm run validate`.
- Debug only when needed: `pnpm --filter '@content-relay/web-app' test:e2e`.
- Update snapshots only when intentional: `pnpm --filter '@content-relay/web-app' test:e2e:update`.

## Anti-Patterns

- CSS selectors for interactive elements, even when they are convenient.
- Unit tests that mock so much UI integration that they no longer cover user behavior.
- Snapshot updates without checking the rendered UI meaningfully changed as intended.
