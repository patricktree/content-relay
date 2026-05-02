# content-relay

Content relay for sending text, URLs, and file bundles between personal devices over a Tailnet-hosted server.

## What this project is for

`content-relay` is a personal cross-device system for sending:

- text
- URLs
- files

See more in

- [./docs/00-PLAN.md](./docs/00-PLAN.md)
- [./docs/01-TECH-DECISIONS.md](./docs/01-TECH-DECISIONS.md)

## Example flow: run the macOS app on this Mac

1. Start the server:
   ```sh
   pnpm --filter '@content-relay/backend' exec node ./src/bin.ts --data-dir="${HOME}/.content-relay"
   ```
2. Create an invite on your server:
   ```sh
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts --server http://YOUR-PI:PORT invite create
   ```
3. Copy the `inviteCode` from the output.
4. Register this Mac as a `macos` device:
   ```sh
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts --server http://YOUR-PI:PORT device register --name "mac" --platform macos --invite INVITE_CODE
   ```
5. Make that profile active:
   ```sh
   pnpm --filter '@content-relay/cli' exec node ./src/cli.ts device use "mac"
   ```
6. Launch the app:
   ```sh
   open "apps/macos-app/dist/Content Relay.app"
   ```
7. In the menu bar app, open **Settings…** if needed and click **Import Active CLI macOS Profile**.
8. Click **Test Fetch** to verify connectivity.
9. Send something to `mac` from another registered device.

Example from another CLI profile:

```sh
pnpm --filter '@content-relay/cli' exec node ./src/cli.ts --device "Some Other Device" send text "hello mac" --to "mac"
```

Expected behavior:

- URL: opens automatically in the default browser
- text: opens automatically in a dedicated text window
- file: shows a notification, then opens a file detail window when clicked
