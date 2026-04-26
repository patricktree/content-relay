# Agent Instructions

## Package Manager

- Use `pnpm`.
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Format check: `pnpm format:check`

## File-Scoped Commands

| Task              | Command                                                               |
| ----------------- | --------------------------------------------------------------------- |
| Format file       | `pnpm exec oxfmt path/to/file.ts`                                     |
| Lint file         | `pnpm exec eslint path/to/file.ts`                                    |
| Typecheck package | `pnpm --filter <package-name> exec tsc --project tsconfig.build.json` |
| Build package     | `pnpm --filter <package-name> build`                                  |

## Validation

- Before handoff, run: `pnpm format:check && pnpm lint && pnpm build`
- Pre-commit hook runs the same checks.

## Commit Attribution

- AI commits must include:

```text
Co-Authored-By: <agent name> <agent email>
```

## Key Conventions

- Treat `docs/00-PLAN.md`, `docs/01-TECH-DECISIONS.md`, and
  `docs/02-CLI-SPEC.md` as the source of truth for product behavior and
  architecture.
- Preserve strict ports-and-adapters / Clean Architecture boundaries;
  keep domain/application independent from frameworks and platform APIs.
- Keep the CLI headless-first; `packages/cli` should follow the `relay`
  contract in `docs/02-CLI-SPEC.md`.
- Put shared contracts and types in `packages/shared`; keep workspace
  config changes centralized in `packages/config-eslint` and
  `packages/config-typescript`.
- Follow the existing ESM + native TypeScript pattern, including `.ts`
  import extensions.
