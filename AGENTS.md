# Agent Instructions

## Package Manager

- Use `pnpm`.
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Tests: `pnpm test`
- Format check: `pnpm format:check`

## Commit Attribution

AI commits MUST include:

```text
Co-Authored-By: (the agent's name and attribution byline)
```

## Validation

- Before handoff, run from the monorepo root: `pnpm run fix`, then `pnpm run validate`; resolve all reported issues until both pass cleanly.
- `pnpm run fix` runs formatting and autofixable linting.
- `pnpm run validate` runs build, lint, and tests.
- These commands are fast by default or Turborepo-cached; avoid direct fine-grained commands like `pnpm exec oxfmt` unless debugging a failure.

## Testing

- Prefer E2E tests over integration tests over unit tests.
- Follow existing test layout and naming, for example `test/e2e-*.test.ts`.

## Architecture

- Always load the `clean-architecture` skill before working in this monorepo.
- Preserve strict ports-and-adapters / Clean Architecture boundaries; keep domain/application independent from frameworks and platform APIs.
- Put shared contracts and types in `libs/contracts`; keep workspace config in `tooling/config-eslint` and `tooling/config-typescript`.
- Follow the existing ESM + native TypeScript pattern, including `.ts` imports.
- Default to solution-style TypeScript setup: `tsconfig.json` references `tsconfig.build.json` and `tsconfig.tests.json`.
