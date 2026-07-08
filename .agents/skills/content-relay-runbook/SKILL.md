---
name: content-relay-runbook
description: Routes Content Relay local runbooks and device flows. Use when running, smoke-testing, or troubleshooting local Relay Hub, CLI, macOS app, mobile app, web app, Tailnet device flows, or example send/receive flows.
---

# Content Relay Runbook

Use this skill when running Content Relay locally or following a device flow.

## First Actions

1. Read repo root `../../../AGENTS.md` for commands and validation expectations.
2. Read repo root `../../../docs/development.md` for setup and common commands.
3. Read repo root `../../../CONTEXT.md` for domain terms used in flows.
4. Pick the nearest runbook in repo root `../../../docs/runbooks/` before inventing commands.

## Runbook Routing

| Task                                     | Read                                  |
| ---------------------------------------- | ------------------------------------- |
| Launch and verify the macOS menu bar app | `../../../docs/runbooks/macos-app.md` |
| General setup, build, CLI smoke check    | `../../../docs/development.md`        |
| Architecture-sensitive troubleshooting   | Load `content-relay-architecture`     |
| Browser UI smoke testing                 | Load `content-relay-frontend`         |

## Rules

- Use Relay Hub URLs reachable by every participating Device; avoid `127.0.0.1` for cross-device Tailnet flows.
- Prefer `pnpm --filter '<package-name>' ...` commands that match existing docs or package scripts.
- Keep long-running Relay Hub or app processes observable; use tmux if persistence or interaction is needed.
- Do not background long-running processes with `&` in tool calls.
- Record any missing runbook steps as doc follow-up instead of relying on chat-only instructions.

## Completion Checklist

- The selected runbook or missing runbook is named in the handoff.
- Smoke checks use canonical **Device**, **Item**, **Delivery**, and **Relay Hub** terminology.
- If files changed, validation uses repo root commands from `../../../AGENTS.md`: `pnpm run fix`, then `pnpm run validate`.
