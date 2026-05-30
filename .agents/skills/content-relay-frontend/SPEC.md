# Content Relay Frontend Specification

## Intent

Guide agents making frontend web changes in Content Relay so they preserve the existing React, TanStack Query/Form, Linaria, platform-adapter, and testing conventions.

## Scope

In scope:

- Browser-based frontend source, config, and tests.
- App-local frontend instructions colocated with the current web app.
- The current shared web UI in `apps/web-app/**`.
- Shared contracts or client code changed specifically for frontend behavior.
- UI, styling, data fetching, forms, browser storage, and platform-adapter conventions.

Out of scope:

- Relay Hub domain/application internals except as a dependency boundary.
- Native iOS/Android project implementation details outside browser-facing adapter seams.
- General TypeScript guidance already enforced by repo tooling.

## Users And Trigger Context

- Primary users: coding agents editing frontend behavior.
- Common user requests: add/edit web UI, fix a form, change TanStack Query data flow, style a component, handle browser/native adapter input, update Playwright tests.
- Should not trigger for: backend-only changes, CLI-only work, generic docs, or global skill authoring.

## Runtime Contract

- Required first actions: read root `AGENTS.md`, read relevant source/tests, route to references by touched area.
- Required outputs: code/tests that follow current patterns and validation notes in handoff.
- Non-negotiable constraints: preserve clean architecture boundaries and project terminology.
- Expected bundled files loaded at runtime: only the reference files matching the touched area.

## Source And Evidence Model

Authoritative sources:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/01-TECH-DECISIONS.md`
- current browser frontend source and tests
- `apps/web-app/AGENTS.md`
- `apps/web-app/src/**`
- `apps/web-app/test-e2e/**`
- `apps/web-app/package.json` and local config files

Useful improvement sources:

- positive examples: accepted frontend PRs and tests.
- negative examples: review feedback, validation failures, flaky screenshots.
- validation results: `pnpm run fix`, `pnpm run validate`, targeted frontend tests.

Data that must not be stored:

- secrets
- private Relay Hub URLs beyond local test examples
- user content shared through the app

## Reference Architecture

- `SKILL.md` contains activation, first actions, routing, and general frontend rules.
- `apps/web-app/AGENTS.md` contains app-local layout, command, and import notes.
- `references/` contains focused runtime guidance by frontend concern.
- `references/evidence/`, `scripts/`, and `assets/` are unused until a concrete need appears.

## Validation

- Lightweight validation: skill structural validation and markdown linting.
- Deeper validation: apply the skill to frontend tasks and check review/CI outcomes.
- Acceptance gates: agents can identify the right reference file and avoid duplicating app patterns.

## Known Limitations

- The skill captures current conventions; update it when frontend architecture changes.
- It does not replace framework documentation for deep library-specific questions.

## Maintenance Notes

- Update `SKILL.md` when routing, trigger scope, or always-on rules change.
- Update references when conventions for a specific frontend concern change.
- Update `SOURCES.md` when source coverage or major decisions change.
