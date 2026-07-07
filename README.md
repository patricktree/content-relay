# content-relay <!-- omit in toc -->

Content Relay sends text, URLs, and file bundles between personal Devices through a private Tailnet-hosted Relay Hub.

## Quick start

```bash
pnpm install
pnpm run build
pnpm --filter '@content-relay/cli' exec node ./src/cli.ts
```

## Documentation

- [Development](.patricktree-stack/docs/development.md): prerequisites, setup, common commands, and validation.
- [Architecture](docs/architecture.md): Clean Architecture boundaries, package placement rules, TypeScript conventions, and testing expectations.
- [macOS app runbook](docs/runbooks/macos-app.md): local Relay Hub and macOS menu bar app flow.
- [Product language](CONTEXT.md): canonical domain terminology for user-facing behavior and code names.
