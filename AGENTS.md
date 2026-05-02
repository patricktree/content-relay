# Agent Instructions

## Package Manager

- Use `pnpm`.
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Tests: `pnpm test`
- Format check: `pnpm format:check`

## Validation

- Before handoff, run from the monorepo root: `pnpm run fix`, resolve all reported issues, then run `pnpm run verify` and resolve all reported issues until both pass cleanly.
- `pnpm run fix` runs formatting and autofixable linting.
- `pnpm run verify` runs build, lint, and tests.
- These commands are either extremely fast by default or Turborepo-cached, so don't bother running more fine-grained commands (like direct `pnpm exec oxfmt` invocations).

## Testing

- Prefer E2E tests over integration tests over unit tests.
- Follow the existing test layout and naming (for example `test/e2e-*.test.ts`).

## Architecture

- Always load the `clean-architecture` skill before working in projects in this monorepo.
- Preserve strict ports-and-adapters / Clean Architecture boundaries; keep domain/application independent from frameworks and platform APIs.
- Put shared contracts and types in `libs/shared`; keep workspace config changes centralized in `tooling/config-eslint` and `tooling/config-typescript`.
- Follow the existing ESM + native TypeScript pattern, including `.ts` import extensions.
- Default to the solution-style TypeScript setup used across packages: `tsconfig.json` contains project references to `tsconfig.build.json` and `tsconfig.tests.json`; use it as the general-purpose pattern for production code and tests.
