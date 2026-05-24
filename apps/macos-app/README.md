# macOS app

## What it does

- runs as a menu bar app
- fetches pending deliveries from the Relay Hub on launch and on a timer
- auto-opens URL deliveries in the default browser
- auto-opens text deliveries in a dedicated native window
- posts native notifications for file deliveries
- opens a native file detail window for file deliveries
- marks file deliveries viewed when their detail window opens
- downloads single files or whole file bundles from the file detail window
- opens a native send window for text, URL, and file sends
- uploads one or more files as a single logical file item
- lists available target devices from the Relay Hub
- remembers last-used target devices locally
- imports an existing `macos` profile from `~/.content-relay/profiles.json`
- registers the local sender from the Relay Hub URL and a device nickname, then stores the returned device ID locally
- stores local app state in Application Support

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
2. Open **Settings…** from the menu bar and enter:
   - Relay Hub base URL
   - device nickname
3. Click **Save & Register**. The app stores the returned device ID locally.

You can also import an active `macos` CLI profile from the settings window.

## Manual verification checklist

- use **Send…** to send text to another device
- use **Send…** to send a URL to another device
- use **Send…** to send one or more files to another device
- send a URL to the macOS device and confirm the browser opens automatically
- send a text item to the macOS device and confirm the text window opens automatically
- send a file item to the macOS device and confirm a native notification appears
- open the file detail window and confirm **Download All** saves the received file or bundle
- toggle **Launch at Login** from the menu bar while running the bundled `.app`
