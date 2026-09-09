# mobile app

## What it does

- provides the shared Capacitor shell for iOS and Android
- keeps the native Capacitor projects in `ios/` and `android/`
- syncs the shared web bundle from `apps/web-app/` into the native projects
- on Android, accepts shared text and URLs from the OS share sheet and forwards them into the shared send UI

## Build

From the repo root:

```sh
pnpm --filter '@content-relay/mobile-app' build
```

This runs the cached shared web build and Capacitor configuration check, then syncs web assets into both native projects. Sync runs outside Turbo and always executes, even when both build tasks hit the cache.

The repository-wide `pnpm build` and `pnpm validate` run `turbo:build` without syncing native projects. Use the mobile package's `build` command above before building or installing a native app.

If you already built the shared web app and only want to refresh the native shells:

```sh
pnpm --filter '@content-relay/mobile-app' native:sync
```

## Android SDK setup

Before running Android builds locally, create `android/local.properties` with a simple one-liner:

```sh
cd apps/mobile-app
echo 'sdk.dir=/absolute/path/to/your/Android/sdk' > ./android/local.properties
```

## Android deploy

With an Android emulator running or a physical Android device connected via ADB, from the repo root run:

```sh
pnpm --filter '@content-relay/mobile-app' build && cd apps/mobile-app/android && ./gradlew installDebug
```

That installs the debug app on the connected Android target.

## Manual verification checklist

- run the build and confirm it succeeds
- open the iOS project and confirm the app renders the shared web UI
- open the Android project and confirm the app renders the shared web UI
- on Android, share text and a URL from another app and confirm Content Relay opens with the compose form prefilled
