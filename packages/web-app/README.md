# web app

## What it does

- provides the shared React + Vite UI used by the mobile app
- keeps the shared web source in `src/`
- builds the web bundle consumed by `@content-relay/mobile-app`

## Build

From the repo root:

```sh
pnpm --filter '@content-relay/web-app' build
```

The build produces:

- `packages/web-app/dist/types`
- `packages/web-app/dist/web`

## Manual verification checklist

- run the build and confirm it succeeds
- open the shared web app in a browser and confirm it renders the send screen
- run `turbo run build --filter=@content-relay/mobile-app` and confirm the native shells sync the latest bundle
