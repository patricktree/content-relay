# Run the macOS app locally

Use a Relay Hub URL that every participating device can reach. On a Tailnet, that is usually the Relay Hub machine's Tailnet hostname or IP, not `127.0.0.1`.

## Steps

1. Start the Relay Hub and keep it running:

   ```bash
   pnpm --filter '@content-relay/relay-hub' exec node ./src/bin.ts \
     --port 4000 \
     --base-url http://YOUR-PI:4000 \
     --data-dir="${HOME}/.content-relay"
   ```

2. Build and launch the macOS app:

   ```bash
   pnpm --filter '@content-relay/macos-app' build
   open "apps/macos-app/dist/Content Relay.app"
   ```

3. In the menu bar app, open **Settings…**, enter the Relay Hub URL and device nickname, then click **Save & Register**.
4. Click **Test Fetch** to verify connectivity.
5. Send something to the macOS Device ID from another registered Device.

Example from another CLI Device:

```bash
pnpm --filter '@content-relay/cli' exec node ./src/cli.ts \
  --relay-hub-base-url http://YOUR-PI:4000 \
  send text \
  --source-device-id dev_SENDER \
  "hello mac" \
  --target-device-id dev_MAC
```

## Expected behavior

- Deliveries do not open automatically when they arrive; refresh the Deliveries list in the app and click **Open**.
- URL Items open in the Mac's default browser when **Open** is clicked.
- Text Items open in an in-app detail dialog when **Open** is clicked.
- File Items are not supported in the macOS app yet; their **Open** button is disabled.
