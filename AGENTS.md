# Agent Instructions

## Package Manager

- Use `pnpm`.
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Format check: `pnpm format:check`

## Validation

- Before handoff, run from the monorepo root: `pnpm run build && pnpm run lint:fix && pnpm run test`
- To format everything, run from the monorepo root: `pnpm run format`
- These commands are either extremely fast by default or Turborepo-cached, so don't bother running more fine-grained commands (like direct `pnpm exec oxfmt` invocations).

- Preserve strict ports-and-adapters / Clean Architecture boundaries;
  keep domain/application independent from frameworks and platform APIs.
- Put shared contracts and types in `packages/shared`; keep workspace
  config changes centralized in `packages/config-eslint` and
  `packages/config-typescript`.
- Follow the existing ESM + native TypeScript pattern, including `.ts`
  import extensions.
