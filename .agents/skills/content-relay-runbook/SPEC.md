# content-relay-runbook SPEC

## Purpose

Route agents to Content Relay local runbooks and keep device-flow execution consistent.

## Invocation

Use when running, smoke-testing, or troubleshooting local Relay Hub, CLI, macOS app, mobile app, web app, Tailnet device flows, or example send/receive flows.

## Runtime contract

- Route agents to `docs/development.md`, `docs/runbooks/`, and `CONTEXT.md`.
- Prefer documented commands over ad hoc flows.
- Keep local processes observable and avoid backgrounding long-running commands in tool calls.
- Capture missing runbook steps as documentation follow-up.

## Maintenance

Update this skill when runbooks, local command patterns, or process-management guidance changes.
