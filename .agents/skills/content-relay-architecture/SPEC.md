# content-relay-architecture SPEC

## Purpose

Guide agents through Content Relay-specific Clean Architecture decisions and package-boundary checks.

## Invocation

Use when work crosses app/lib boundaries, shared contracts, client APIs, native platform adapters, Relay Hub behavior, package placement, or TypeScript project boundaries.

## Runtime contract

- Require loading the generic `clean-architecture` skill.
- Route agents to repo root `docs/architecture.md` and `CONTEXT.md` for canonical facts.
- Provide a compact boundary and package-placement checklist.
- Stay procedural; do not replace durable architecture docs.

## Maintenance

Update this skill when package layout, architecture docs, boundary rules, or validation commands change.
