# Technology Decisions

## Purpose

This document records the concrete technology choices made for the
first implementation of the content-relay system described in
[00-PLAN.md](./00-PLAN.md).

The goal is to keep the stack explicit, reduce re-litigation, and make
the intended architectural boundaries clear before implementation
starts.

## Architecture

### Core architecture style

- Use a strict ports-and-adapters / Clean Architecture split.
- The domain and application layers must not depend on `Hono`,
  `Drizzle`, push SDKs, browser-extension APIs, or platform-specific
  mobile APIs.
- Frameworks, database access, push delivery, and filesystem/blob
  handling are infrastructure details.

### Intended layers

- `domain`
  - entities and value objects such as devices, invites, items, and
    deliveries
- `application`
  - use cases such as send item, fetch pending deliveries, acknowledge
    delivery, mark viewed, and register device
- `ports`
  - interfaces for repositories and infrastructure capabilities
- `infrastructure`
  - `Drizzle`, SQLite, filesystem blob store, push providers, auth
    hashing, and HTTP adapters
- `interfaces`
  - `Hono` route handlers, CLI wiring, React Native integration, and
    Brave extension integration

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
- Use Node built-in `crypto.scrypt` and `crypto.timingSafeEqual` for
  hashing and verification.
- Do not use JWTs for device authentication in v1.

### IDs and time

- Generate IDs with platform primitives such as
  `crypto.randomUUID()`.
- Standardize time handling on `Temporal` via
  [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill).
- Use `Temporal.Instant` for persisted server timestamps where
  possible.

### Observability

- Use `@opentelemetry/sdk-node` for telemetry setup.
- Use `@opentelemetry/sdk-logs` for logging.
- Do not add a separate application logger dependency in v1.

### Delivery and retries

- Delivery remains pull-based with the server as source of truth.
- Recipients fetch pending deliveries from the server.
- Retry behavior for wake notifications should stay simple and
  database-driven in v1.
- Do not introduce a separate queue system in v1 for server-side
  retries.

### Uploads

- File uploads use standard `multipart/form-data`.
- Do not use a resumable upload protocol such as `tus` in v1.

## Shared contracts

- Use `zod` as the shared runtime schema system.
- Share wire-format schemas and inferred TypeScript types across server
  and clients.
- Keep transport/client helpers thin and avoid pulling framework or UI
  concerns into shared packages.

## Mobile apps

### Platform and app structure

- App model: bare React Native from day one
- Navigation: `react-navigation`

### Push notifications

- Use platform-specific integrations rather than a cross-platform
  abstraction.
- Android push: `@react-native-firebase/messaging`
- iOS push: direct native APNs integration in the React Native iOS app

### Local storage

- General local persistence: `@react-native-async-storage/async-storage`
- Secret storage for device credentials: `react-native-keychain`

## Brave extension

### Implementation approach

- Language: plain `TypeScript`
- Extension APIs: native Chromium extension APIs
- Build tooling: `vite`

### Rationale

- The extension feasibility spike is the main technical risk.
- Avoid an abstraction layer such as `plasmo` during the initial spike
  so background/wakeup behavior is easier to reason about and debug.

## CLI

- CLI framework: `commander`
- Typing support: `@commander-js/extra-typings`
- HTTP client: built-in `fetch`

## Testing

### Test runner

- Use `vitest` for tests.

### Server end-to-end tests

- Exercise a real started HTTP server.
- Use `fetch` in tests rather than framework-specific request helpers.

## Explicit non-choices for v1

- No JWT-based device auth
- No resumable upload protocol
- No extension framework such as `plasmo`
- No separate queue system such as `bullmq`
- No separate app logger such as `pino`
- No mobile persistent archive of delivered items

## Open items not resolved here

- Exact package/workspace layout
- Exact shared-package boundaries
- Invite-link implementation details
- Exact OpenTelemetry exporter and backend choice
- Brave extension feasibility outcome for background receive with no
  visible page or tab
