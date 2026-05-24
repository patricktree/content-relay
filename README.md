# content-relay <!-- omit in toc -->

Content relay for sending text, URLs, and file bundles between personal devices over a Tailnet-hosted Relay Hub.

- [What this project is for](#what-this-project-is-for)
- [Development Setup](#development-setup)
  - [Prerequisites](#prerequisites)
  - [Build \& Run](#build--run)
- [Example flows](#example-flows)
  - [Run the macOS app on this Mac](#run-the-macos-app-on-this-mac)

## What this project is for

`content-relay` is a personal cross-device system for sending:

- text
- URLs
- files and file bundles

See more in:

- [./docs/00-PLAN.md](./docs/00-PLAN.md)
- [./docs/01-TECH-DECISIONS.md](./docs/01-TECH-DECISIONS.md)

## Development Setup

### Prerequisites

- **pnpm:** This monorepo uses [`pnpm`](https://pnpm.io/) as package manager.  
  It is recommended to install the [standalone script](https://pnpm.io/installation#using-a-standalone-script), for POSIX systems just run:

  ```bash
  curl -fsSL https://get.pnpm.io/install.sh | sh -
  ```

  `pnpm` commands should now be available, and `pnpm` will use the correct version automatically (the version specified in `package.json#packageManager`).

- **Node.js:** `pnpm` manages the Node.js version, so as long as you run everything via `pnpm run` or `pnpm exec`, the correct Node.js version will be used.  
  Run `pnpm exec node ...` when you want to run Node.js code.

  If you want to be able to also run `node` directly (instead of `pnpm exec node`) with the correct version, you need to have the correct Node.js version globally installed and in use.

- **Toolchain for native Node.js modules:** Run the installation instructions "A C/C++ compiler tool chain for your platform" of [microsoft/vscode/wiki/How-to-Contribute#prerequisites](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites).
- **Docker and Docker Compose:** e.g. via [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### Build & Run

```bash
pnpm install
pnpm run build
pnpm --filter cli exec node ./src/cli.ts
```

## Example flows

### Run the macOS app on this Mac

Use a Relay Hub URL that every participating device can reach. On a Tailnet, that is usually the Relay Hub machine's Tailnet hostname or IP, not `127.0.0.1`.

1. Start the Relay Hub and keep it running:

   ```bash
   pnpm --filter '@content-relay/relay-hub' exec node ./src/bin.ts \
     --port 4000 \
     --base-url http://YOUR-PI:4000 \
     --data-dir="${HOME}/.content-relay"
   ```

2. Create an invite on your Relay Hub:

   ```bash
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts \
     --relay-hub-base-url http://YOUR-PI:4000 \
     invite create
   ```

3. Copy the `inviteCode` from the output.

4. Register this Mac as a `macos` device:

   ```bash
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts \
     --relay-hub-base-url http://YOUR-PI:4000 \
     device register \
     --name "mac" \
     --platform macos \
     --invite INVITE_CODE
   ```

5. Make that profile active:

   ```bash
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts device use "mac"
   ```

6. Build and launch the macOS app:

   ```bash
   pnpm --filter '@content-relay/macos-app' build
   open "apps/macos-app/dist/Content Relay.app"
   ```

7. In the menu bar app, open **Settings…** if needed and click **Import Active CLI macOS Profile**.
8. Click **Test Fetch** to verify connectivity.
9. Send something to `mac` from another registered device.

Example from another CLI profile:

```bash
pnpm --filter '@content-relay/cli' exec node ./src/cli.ts \
  --device "Some Other Device" \
  send text "hello mac" \
  --to "mac"
```

Expected behavior:

- URL: opens automatically in the default browser
- text: opens automatically in a dedicated text window
- file: shows a notification, then opens a file detail window when clicked
