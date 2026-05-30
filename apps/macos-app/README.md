# macOS app

## What it does

- runs as a Tauri menu bar app
- keeps the Content Relay paper-plane menu bar item
- opens the web app window when the menu bar item is clicked
- uses the same built web app as the Capacitor mobile app
- opens URL Deliveries from the web app in the Mac's default browser

## Build

From the repo root:

```sh
pnpm --filter '@content-relay/macos-app' build
```

The build produces:

- `apps/macos-app/dist/Content Relay.app`

Open it with:

```sh
open "apps/macos-app/dist/Content Relay.app"
```

## First-run setup

1. Launch the app.
2. Click the Content Relay menu bar item.
3. Enter and save the Relay Hub URL and this Device nickname in the web app settings.

## Manual verification checklist

- click the menu bar item and confirm the web app window appears
- close the window and confirm the menu bar item remains running
- send a URL Delivery to this Device, click **Open** in the Deliveries list, and confirm the URL opens in the default browser
