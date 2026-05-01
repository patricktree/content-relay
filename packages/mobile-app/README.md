# mobile app

## What it does

- provides one shared Capacitor app package for iOS and Android
- renders a minimal React-based hello-world screen
- keeps the shared web UI in `src/`
- keeps the native Capacitor shells in `ios/` and `android/`
- builds the web bundle and syncs it into the native projects

## Build

From the repo root:

```sh
pnpm --filter '@content-relay/mobile-app' build
```

The build produces:

- `packages/mobile-app/vite-outdir`
- synced web assets in the native Capacitor projects

## Android SDK setup

Before running Android builds locally, create `android/local.properties` with a simple one-liner:

```sh
cd packages/mobile-app
echo 'sdk.dir=/absolute/path/to/your/Android/sdk' > ./android/local.properties
```

## Manual verification checklist

- run the build and confirm it succeeds
- open the iOS project and confirm the app renders the hello-world screen
- open the Android project and confirm the app renders the hello-world screen
