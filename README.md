# content-relay

Content relay for sending text, URLs, and file bundles between personal devices over a Tailnet-hosted Relay Hub.

## What this project is for

`content-relay` is a personal cross-device system for sending:

- text
- URLs
- files and file bundles

See more in:

- [./docs/00-PLAN.md](./docs/00-PLAN.md)
- [./docs/01-TECH-DECISIONS.md](./docs/01-TECH-DECISIONS.md)

## Setup

From the repo root:

```sh
corepack enable
pnpm install
```

## Example flow: run the macOS app on this Mac

Use a Relay Hub URL that every participating device can reach. On a Tailnet, that is usually the Relay Hub machine's Tailnet hostname or IP, not `127.0.0.1`.

1. Start the Relay Hub and keep it running:

   ```sh
   pnpm --filter '@content-relay/relay-hub' exec node ./src/bin.ts \
     --port 4000 \
     --base-url http://YOUR-PI:4000 \
     --data-dir="${HOME}/.content-relay"
   ```

2. Create an invite on your Relay Hub:

   ```sh
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts \
     --relay-hub-url http://YOUR-PI:4000 \
     invite create
   ```

3. Copy the `inviteCode` from the output.

4. Register this Mac as a `macos` device:

   ```sh
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts \
     --relay-hub-url http://YOUR-PI:4000 \
     device register \
     --name "mac" \
     --platform macos \
     --invite INVITE_CODE
   ```

5. Make that profile active:

   ```sh
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts device use "mac"
   ```

6. Build and launch the macOS app:

   ```sh
   pnpm --filter '@content-relay/macos-app' build
   open "apps/macos-app/dist/Content Relay.app"
   ```

7. In the menu bar app, open **Settings…** if needed and click **Import Active CLI macOS Profile**.
8. Click **Test Fetch** to verify connectivity.
9. Send something to `mac` from another registered device.

Example from another CLI profile:

```sh
pnpm --filter '@content-relay/cli' exec node ./src/cli.ts \
  --device "Some Other Device" \
  send text "hello mac" \
  --to "mac"
```

Expected behavior:

- URL: opens automatically in the default browser
- text: opens automatically in a dedicated text window
- file: shows a notification, then opens a file detail window when clicked
