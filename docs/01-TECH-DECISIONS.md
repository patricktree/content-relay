# Technology Decisions

## Purpose

This document records the concrete technology choices made for the first implementation of the content-relay system described in [00-PLAN.md](./00-PLAN.md).

The goal is to keep the stack explicit, reduce re-litigation, and make the intended architectural boundaries clear before implementation starts.

## Architecture

### Core architecture style

- Use a strict ports-and-adapters / Clean Architecture split.
- The domain and application layers must not depend on `Hono`, `Drizzle`, Capacitor plugins, push SDKs, or platform-specific mobile APIs.
- Frameworks, database access, push delivery, filesystem/blob handling, and native mobile integration are infrastructure details.

### Intended layers

- `domain`
  - entities and value objects such as devices, invites, items, and deliveries
- `application`
  - use cases such as send item, fetch pending deliveries, acknowledge delivery, mark viewed, register device, and refresh push token
- `ports`
  - interfaces for repositories and infrastructure capabilities
- `infrastructure`
  - `Drizzle`, SQLite, filesystem blob store, push providers, auth hashing, and HTTP adapters
- `interfaces`
  - `Hono` route handlers, CLI wiring, Capacitor mobile integration, and macOS app integration

## Server

### Runtime and HTTP API

- Runtime: `Node.js`
- Language: `TypeScript`
- HTTP framework: `Hono`
- HTTP validation: `zod` with `@hono/zod-validator`
- HTTP client: built-in `fetch`

### Database and storage

- Metadata database: `SQLite`
- Query layer / ORM: `Drizzle`
- Migrations: `drizzle-kit`
- Blob/file storage: filesystem blobs outside SQLite

### Storage boundary design

- Model file storage as a dedicated `BlobStore` port.
- Keep blob storage separate from metadata persistence.
- Keep file metadata in SQLite and file contents on the filesystem.

### Auth and secrets

- Device authentication uses opaque random tokens.
- Store tokens hashed at rest.
- Use Node built-in `crypto.scrypt` and `crypto.timingSafeEqual` for hashing and verification.
- Do not use JWTs for device authentication in v1.

### IDs and time

- Generate IDs with platform primitives such as `crypto.randomUUID()`.
- Standardize time handling on `Temporal` via [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill).
- Use `Temporal.Instant` for persisted server timestamps where possible.

### Observability

- Use `@opentelemetry/sdk-node` for telemetry setup.
- Use `@opentelemetry/sdk-logs` for logging.
- Do not add a separate application logger dependency in v1.

### Delivery and retries

- Delivery remains pull-based with the server as source of truth.
- Recipients fetch pending deliveries from the server.
- Retry behavior for wake notifications should stay simple and database-driven in v1.
- Do not introduce a separate queue system in v1 for server-side retries.

### Uploads

- File uploads use standard `multipart/form-data`.
- A single file-upload request may contain **one or more files**.
- Multiple files uploaded in one send must be stored and delivered as **one logical item/unit**.
- The server data model must support a **one-to-many** relationship from a file item to its contained files.
- Do not use a resumable upload protocol such as `tus` in v1.

### Push delivery

- Keep delivery pull-based with the server as source of truth.
- Treat push as a **wake + notification** mechanism, not as the authoritative payload channel.
- Use one push-provider port with platform-specific infrastructure adapters.
- Push provider is inferred from device platform:
  - `ios` -> **APNs**
  - `android` -> **FCM**
- Support one active push token per device in v1.
- Mobile registration stores the initial device and push token atomically.
- Keep a post-registration push-token refresh endpoint for token rotation and recovery.

## Shared contracts

- Use `zod` as the shared runtime schema system.
- Share wire-format schemas and inferred TypeScript types across server and clients.
- Keep transport/client helpers thin and avoid pulling framework or UI concerns into shared packages.
- Canonical device platforms are:
  - `cli`
  - `macos`
  - `ios`
  - `android`
  - `generic`
- Registration request shape:
  - `pushRegistration` is required for `ios` and `android`
  - `pushRegistration` is absent for `cli`, `macos`, and `generic`

## Shared UI direction

- All interactive UIs should follow a deliberately **minimal** design.
- Use a **black-and-white** visual language in v1.
- Standard/default buttons should use a **white background**, **black text**, and a **black border**.
- Primary buttons should use a **black background**, **white text**, and a **black border**.
- Avoid decorative styling, colorful accents, gradients, or other visual shenanigans unless platform conventions or accessibility requirements force a deviation.

## Mobile app

### Mobile app structure

- Build the shared mobile web UI in `apps/web-app`.
- Use **Capacitor** for the native app shells in `apps/mobile-app`.
- Use **React** for the shared mobile web UI.
- Keep the native `ios/` and `android/` projects under `apps/mobile-app`.
- Have `apps/mobile-app` consume the built web assets from `apps/web-app`.
- Do not create separate top-level `apps/ios-app` or `apps/android-app` directories in v1.

### Mobile client architecture

- Refactor `libs/client` into a platform-neutral headless client core.
- Share that client core across the CLI, automated tests, macOS app integration, and the Capacitor mobile app.
- Keep local profile storage, preference storage, and delivery-deduplication state behind platform-specific adapters.

### Mobile registration

- Mobile registration is atomic.
- For `ios` and `android`, device registration is only complete after:
  - notification permission is granted
  - native push registration succeeds
  - the push token is uploaded during registration
- If mobile setup fails before the final registration request, the invite remains unused.
- Mobile registration uses the same `POST /devices/register` endpoint as other device types.

### Mobile push notifications

- Use `@capacitor/push-notifications` for native push token registration and notification event handling.
- Notification payloads should include at least:
  - `deliveryId`
  - `itemId`
  - `itemType`
- Treat push payload fields other than identifiers as presentation hints only.
- On notification tap, the app should fetch authoritative delivery state from the server before routing.

### Mobile foreground behavior

- When the mobile app is foregrounded, handle deliveries **in-app only**.
- Do not show a native notification/banner while the app is already active.
- Do not auto-navigate or auto-open URLs, text screens, or file screens on foreground delivery.

### Mobile local storage

- Do not keep a persistent recipient archive in v1.
- Persist only minimal app-local state such as:
  - device credentials
  - handled delivery IDs
  - last-used targets
  - app preferences
- Regular app-local storage is good enough for mobile credentials in v1.

### iOS-specific mobile decisions

- iOS push: direct native **APNs** integration via Capacitor.
- Enable the iOS Push Notifications capability and wire the required `AppDelegate.swift` hooks.
- Use the shared mobile UI for receive flows.
- Prefer Capacitor-first share-sheet integration, but add the minimum native integration required if pure Capacitor cannot reliably satisfy fixed product requirements.

### Android-specific mobile decisions

- Android push: **FCM** via `@capacitor/push-notifications`.
- Provide the app-level `google-services.json` and configure Android notification channels and icon metadata as needed.
- Use the shared mobile UI for receive flows.
- Prefer Capacitor-first share-in integration, but add the minimum native integration required if pure Capacitor cannot reliably satisfy fixed product requirements.
- There is no Android PWA or mobile-web fallback in v1.

## macOS app

### macOS app structure

- macOS client model: native **menu bar app**
- Language: **Swift**
- UI framework: **SwiftUI**, with AppKit interop where menu bar or window-management details require it

### Delivery / wake model

- macOS delivery remains pull-based with the server as source of truth
- The app should launch at login and remain available in the background during the user session
- Fetch pending deliveries on launch, on reconnect, and on a simple periodic timer
- Do not depend on Chromium extension lifecycle or Web Push for macOS receive in v1

### Notifications and storage

- macOS notifications: native `UserNotifications`
- macOS secret storage for device credentials: Keychain Services
- macOS lightweight local persistence: app-native storage for handled delivery IDs and last-used targets

### Browser integration

- Open received URLs in the default browser
- Browser-specific send affordances are out of scope for v1 and may be added later via an optional Chromium extension

## CLI / headless client

- The CLI is the **primary early development and testing surface**; see [02-CLI-SPEC.md](./02-CLI-SPEC.md).
- CLI binary name: `relay`
- CLI framework: `commander`
- Typing support: `@commander-js/extra-typings`
- HTTP client: built-in `fetch`
- Build a reusable headless client core that is shared by the CLI, automated end-to-end tests, macOS app integration, and the mobile app.
- Support multiple locally stored registered-device profiles so the CLI can simulate `cli`, `macos`, `ios`, `android`, and `generic` device behavior at the product-logic level.
- Persist CLI-local state outside the repo, including device credentials, active-device selection, last-used targets, and handled delivery IDs.
- A future TUI is optional and must reuse the same headless client core and local profile store rather than implementing a second protocol client.

## Testing

### Test runner

- Use `vitest` for tests.

### Server end-to-end tests

- Exercise a real started HTTP server.
- Use `fetch` in tests rather than framework-specific request helpers.
- Prefer driving the system through the shared headless client core so end-to-end tests match the CLI behavior used for manual validation.

## Explicit non-choices for v1

- No JWT-based device auth
- No resumable upload protocol
- No Android PWA
- No mobile-web fallback client
- No React Native mobile app
- No separate top-level Android and iOS app packages
- No Chromium extension in v1
- No Electron- or Tauri-based macOS client in v1
- No separate queue system such as `bullmq`
- No separate app logger such as `pino`
- No persistent recipient archive on Android or iOS in v1

## Open items not resolved here

- Exact package/workspace layout details beyond the major package boundaries
- Invite-link implementation details
- Exact OpenTelemetry exporter and backend choice
- Exact iOS share-extension implementation details and limits
- Exact Android share-intent implementation details and limits
- Exact mobile file download/storage UX inside Capacitor
- Exact macOS app window/popover UX for received text and file items
- Whether a future Chromium extension should talk directly to the server or hand off to the macOS app for send actions
