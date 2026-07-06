---
name: content-relay-testing
description: Applies Content Relay testing conventions. Use before adding, changing, or choosing tests, including integration tests, E2E tests, unit tests, Vitest, Playwright, Rust tests, test naming, test layout, or validation strategy.
---

# Content Relay Testing

Use this skill when deciding what tests to add or change in Content Relay.

## First Actions

1. Read repo root `../../../AGENTS.md` for current validation rules.
2. Read repo root `../../../docs/architecture.md#testing-expectations` for the canonical testing preference.
3. Inspect nearby tests before introducing new naming, fixtures, or helpers.

## Test Selection

Prefer tests in this order:

1. Integration tests for package boundaries, adapter seams, and cross-module behavior.
2. E2E tests for user-visible behavior and full wiring across surfaces.
3. Unit tests only for critical code paths or code that is difficult to reach through integration or E2E tests.

## Rules

- Prefer existing test harnesses and helper packages before adding new utilities.
- Keep test names user- or behavior-oriented.
- Use domain language from repo root `../../../CONTEXT.md`.
- Follow existing test layout and naming, for example `test/e2e-*.test.ts`.
- Add regression coverage at the highest useful level that can reliably reproduce the bug.
- Avoid low-value unit tests that mirror implementation details.

## Completion Checklist

- The chosen test level is justified by the behavior under test.
- New tests follow nearby file naming and helper patterns.
- Validation uses repo root commands from `../../../AGENTS.md`: `pnpm run fix`, then `pnpm run validate`.
