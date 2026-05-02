# mobile app

## What it does

- provides the shared Capacitor shell for iOS and Android
- keeps the native Capacitor projects in `ios/` and `android/`
- syncs the shared web bundle from `packages/web-app/` into the native projects

## Build

From the repo root:

```sh
pnpm --filter '@content-relay/mobile-app' build
```

That builds `@content-relay/web-app` first and then syncs its web assets into the native Capacitor projects.

If you already built the shared web app and only want to refresh the native shells:

```sh
pnpm --filter '@content-relay/mobile-app' native:sync
```

## Android SDK setup

Before running Android builds locally, create `android/local.properties` with a simple one-liner:

```sh
cd packages/mobile-app
echo 'sdk.dir=/absolute/path/to/your/Android/sdk' > ./android/local.properties
```

## Android deploy

With an Android emulator running or a physical Android device connected via ADB, from the repo root run:

```sh
pnpm --filter '@content-relay/mobile-app' build && cd packages/mobile-app/android && ./gradlew installDebug
```

That installs the debug app on the connected Android target.

## Manual verification checklist

- run the build and confirm it succeeds
- open the iOS project and confirm the app renders the shared web UI
- open the Android project and confirm the app renders the shared web UI
