# content-relay-testing SPEC

## Purpose

Guide agents toward the repo's preferred testing strategy and existing test conventions.

## Invocation

Use before adding, changing, or selecting tests in Content Relay.

## Runtime contract

- Route agents to `AGENTS.md` and `docs/architecture.md#testing-expectations`.
- Prefer integration tests, then E2E tests, then narrowly justified unit tests.
- Keep guidance procedural and avoid duplicating large testing documentation.

## Maintenance

Update this skill when the repo's testing preference, validation commands, or common test layout changes.
