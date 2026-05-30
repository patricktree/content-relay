# Content Relay Frontend Sources

## Source Inventory

| Source                      | Use                                                                |
| --------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md`                 | package manager, validation, testing, architecture rules           |
| `CONTEXT.md`                | canonical product and domain terminology                           |
| `docs/01-TECH-DECISIONS.md` | architecture, shared UI direction, mobile/web decisions            |
| current frontend source     | active React, Query, Form, Linaria, platform, and storage patterns |
| `apps/web-app/AGENTS.md`    | app-local layout, command, import, and testing notes               |
| `apps/web-app/README.md`    | current app purpose and manual verification checklist              |
| `apps/web-app/package.json` | framework/library versions and commands                            |
| `apps/web-app/src/**`       | current shared web UI implementation patterns                      |
| `apps/web-app/test-e2e/**`  | preferred E2E testing patterns                                     |
| `apps/web-app/*config*`     | Vite, Playwright, Vitest, Linaria, TypeScript, lint configuration  |

## Synthesis Decisions

- Skill class: `generic` project-convention guidance with integration-documentation characteristics.
- Execution shape: `reference-backed-expert`; `SKILL.md` routes to focused references because frontend work has separate optional concerns.
- The skill is intentionally frontend-general first.
- App-specific guidance is colocated in `apps/web-app/AGENTS.md`.
- Simpler inline guidance was rejected because TypeScript, React/forms, Query, styling, platform, and test guidance would make one runtime file too dense.
- No provider-specific mechanics are used; project-level `.agents/skills` keeps the skill portable across compatible agents.

## Coverage Notes

Covered:

- React component, state, effect, and Suspense conventions.
- TanStack Query usage.
- Linaria and design-token styling.
- Capacitor/platform and browser storage boundaries.
- Playwright/Vitest testing patterns.
- Current `apps/web-app` source layout through `apps/web-app/AGENTS.md`.

Known gaps:

- No dedicated accessibility reference yet; add one after enough UI-specific accessibility decisions accumulate.
- No browser manual QA script yet; add only if repeated verification steps become fragile.

## Description Optimization

Should trigger:

- "change the send form"
- "add a TanStack Query mutation to frontend code"
- "style this React component with Linaria"
- "fix Android share handling in the browser UI"
- "update Playwright tests for frontend settings"
- "edit apps/web-app"

Should not trigger:

- "add a Relay Hub database migration"
- "change the CLI command parser"
- "write a global agent skill unrelated to content-relay"
- "update docs only"

Final description names frontend technologies and browser UI work to improve recall without making the skill sound exclusive to `apps/web-app`.
