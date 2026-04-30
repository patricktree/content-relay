# content-relay Plan

## Goal

Build a personal cross-device system that lets the developer send **text**, **URLs**, and **files** from one device to another and have the recipient handle them automatically where possible.

Supported recipient platforms:

- **Android** via the shared **Capacitor Mobile App**
- **iOS** via the shared **Capacitor Mobile App**
- **macOS** via a native **menu bar app**

The central server runs on a **Raspberry Pi inside the Tailnet**.

## Desired behavior

### Payload types

- **Text**
  - macOS / app: auto-open in a dedicated app window
  - iOS: show notification, tap opens app text screen
  - Android: show notification, tap opens app text screen
- **URL**
  - macOS / app: auto-open in the default browser
  - iOS: show notification, tap opens default browser
  - Android: show notification, tap opens default browser
- **File**
  - a file send may contain **one or more files**
  - if the sender shares multiple files in one action, they must be treated as **one logical unit/item**
  - all platforms: show **one notification per file item**, not one notification per file
  - tap opens an item detail screen / UI where the file or file bundle can be downloaded manually
  - the detail UI should support a **one-click download-all** action for multi-file sends

### Delivery expectations

- The server stores every shared item locally.
- If the recipient is offline, delivery is retried when it reconnects.
- The system acts as a permanent archive until items are manually deleted.
- Delivery is **at-least-once**; clients must deduplicate by delivery ID.

## Fixed product decisions

### Sending surfaces

Initial send surfaces should include:

- **iOS app UI**
- **iOS share sheet**
- **Android app UI**
- **Android OS share sheet into the Android app**
- **macOS app UI**
- **CLI**

### Targeting

- A send can target **one or more explicit devices**.
- Default target selection uses the **last-used target(s)**.
- Send flows should **preselect** the last-used target(s) but still show a confirmation UI.

### Device identity

- Devices use **custom nicknames only** in the UI/history.
- The CLI is its **own registered device**.

### Headless validation surface

- The CLI is the **primary early development and testing surface**.
- It must be possible to exercise the real server from the terminal without running the macOS app or the Capacitor mobile app.
- The CLI should support multiple locally stored registered-device profiles so the developer can simulate devices such as:
  - `cli`
  - `macos`
  - `ios`
  - `android`
- The CLI should validate the protocol and product behavior, including send, receive, ack, viewed, multi-target sends, and multi-file bundles.
- An optional future TUI may be added later, but it must wrap the same headless client core and local state rather than becoming a separate client implementation.
- The detailed CLI contract lives in [02-CLI-SPEC.md](./02-CLI-SPEC.md).

### Registration

- New devices join via an **invite/link flow**.
- Support both:
  - **deep link / QR code**
  - **manual one-time code** fallback
- Invites are **single-use** and **short-lived**.
- Mobile registration is **atomic**:
  - notification permission must be granted
  - native push registration must succeed
  - the push token must be uploaded during registration
  - the server must not create a partially registered mobile device
- If mobile registration fails before the final server registration step, the invite remains unused.

### Connectivity and trust model

- The system is **Tailnet-only**.
- Every participating device must have **Tailscale installed and connected**.
- Clients still use **per-device secrets/tokens** after registration.
- No public internet fallback for the Pi server.

### UI design principles

- The UI should be intentionally **minimal** across all app surfaces.
- Use a **black-and-white visual language only** in v1.
- Standard/default buttons should use a **white background**, **black text**, and a **black border**.
- Primary buttons should use a **black background**, **white text**, and a **black border**.
- Avoid decorative styling, colorful accents, gradients, or other visual shenanigans.

## Platform behavior

### Shared mobile app behavior

- Build mobile as **one shared Capacitor app** for iOS and Android with a shared web UI.
- Mobile behavior is **notification-first only**; no auto-open in the background.
- Mobile notification previews should show:
  - text: **truncated preview**
  - URL: **URL string**
  - file: **filename** for single-file sends, or a summary such as **"3 files"** for multi-file sends
- Tapping mobile notifications should:
  - URL -> fetch authoritative delivery state, then open the **default browser**
  - text -> fetch authoritative delivery state, then open the **app text screen**
  - file -> fetch authoritative delivery state, then open the **app file detail / download screen**
- If the app cannot reach the Pi over Tailnet when opening an item, it should **fail immediately with a clear error**.
- If the mobile app is already foregrounded when a delivery arrives:
  - handle it **in-app only**
  - do **not** show a native notification/banner
  - do **not** auto-navigate or auto-open anything
- On mobile, fetch pending deliveries on:
  - app launch
  - app resume / becoming active
  - notification tap
  - explicit user refresh
- Do **not** keep a persistent local archive of delivered items in v1.
- Only minimal local state is needed on mobile, such as:
  - device credentials
  - handled delivery IDs for deduplication
  - last-used targets
  - app preferences
- Mobile credentials may live in regular app-local storage in v1.

### iOS-specific mobile integration

- Use **direct APNs**.
- iOS share flows should target the shared mobile app.
- **Text/URLs** should upload directly from the share flow where feasible.
- **Files** may hand off from the share flow to the main app for upload if platform constraints require it.
- If a fixed product requirement cannot be delivered reliably in pure Capacitor, add the **minimum native iOS integration** necessary.

### Android-specific mobile integration

- Use **FCM** for push notifications.
- Primary Android send surface is the **OS share sheet into the Android app**.
- The Android app should accept incoming shared **text**, **URLs**, and **files**.
- Multiple files shared in one Android share action must remain **one logical file item**.
- If a fixed product requirement cannot be delivered reliably in pure Capacitor, add the **minimum native Android integration** necessary.
- There is **no Android PWA or mobile-web fallback in v1**.

### macOS app

- Preferred macOS receiver is a native **menu bar app**, not a browser extension.
- The app should **launch at login** and continue running in the background while the user session is active.
- If the app is running and receiving works, then:
  - URL -> auto-open in the **default browser**
  - text -> auto-open in a **dedicated app window**
  - file -> notification only
- If URL/text auto-open already happened, do **not** also show a macOS notification.
- Browser-specific send affordances such as **send current tab**, **send right-clicked link**, or **send selected text** are **not required in v1** and can be added later via an optional Chromium extension.

## Major risk / feasibility watchlist

The earlier Android PWA and browser-based feasibility questions are no longer relevant.

The most important remaining feasibility watch areas are:

- Capacitor-compatible **share-in** support for iOS text, URLs, and files
- Capacitor-compatible **share-in** support for Android text, URLs, and files
- Native push wiring for **APNs** and **FCM**
- Notification tap routing into the shared mobile web UI
- File download/storage UX inside the Capacitor app

The macOS app should still get a small early prototype, but it is no longer the architectural gate for the project.

## Server architecture

### Stack

- **Node.js / TypeScript**
- **SQLite** for metadata
- **Filesystem** for file blobs

### Storage model

Use SQLite for:

- `devices`
- `invites`
- `items`
- `deliveries`
- `push_tokens`
- `file_metadata`

For file items, `file_metadata` must support a **one-to-many** relationship from an `item` to one or more files in the same bundle.

Use the filesystem for:

- uploaded file contents / blobs

### Item model

Each shared item should have:

- `itemId`
- `type`: `text | url | file`
- optional `title`
- source device ID
- original payload data
- created timestamp

For `file` items:

- a single item may contain **one or more files**
- multiple files shared in one send must remain a **single logical item/unit**
- recipients should receive **one delivery record** and **one notification** for that file item

Rules:

- No URL metadata fetching in v1
- Optional custom title supported
- URL detection rule for senders with a **free-form text entry field**:
  - if payload is a **single-line valid URL**, treat it as a URL
  - otherwise treat it as text
- Senders with **explicit typed actions** such as a dedicated `send url` command should validate the chosen type instead of silently coercing it

### Delivery model

Each target device gets its own delivery record.

Suggested delivery states:

- `pending`
- `delivered`
- `viewed`
- optional later: `failed`

Semantics:

- `delivered` = client fetched and acknowledged the item
- `viewed` = user opened the item

### Retention

- Keep items **forever until manually deleted**
- Archive is the default behavior
- Store data **unencrypted at rest** in v1

## Delivery protocol

### Core principles

- Server is the **source of truth**
- Delivery is **at-least-once**
- Clients must be **idempotent**
- No persistent local archive on recipients in v1

### Recommended flow

1. Sender uploads item to server
2. Server persists item and target deliveries
3. Server attempts a **best-effort immediate wake/notification** for mobile recipients
4. Recipient fetches authoritative item state from the server
5. Recipient acknowledges delivery
6. Recipient marks viewed after user open

### Sender-side semantics

- Send succeeds when the server has **accepted and stored** the item.
- If the server is unreachable while sending, **fail immediately with a clear error**.
- If immediate mobile push wake fails, send still succeeds once the item is durably stored.
- Sender should be able to inspect **per-device status** later:
  - pending
  - delivered
  - viewed

## Client-specific notes

### macOS sender capabilities

The macOS app should support all of the following in v1:

- manual paste/input UI for text and URLs
- file upload from the app UI

Defer browser-specific send affordances such as the following to a possible future Chromium extension:

- send current page URL
- send right-clicked link URL
- send selected text

## Suggested milestone plan

### Milestone 0: Core backend foundation + headless CLI test harness

Goal: build the first complete vertical slice through the system so the developer can validate the real server and core product behavior before native clients exist.

Deliverables:

- CLI spec locked in [02-CLI-SPEC.md](./02-CLI-SPEC.md)
- Node.js / TypeScript server
- SQLite schema
- filesystem blob storage
- invite creation + device registration
- per-device token auth
- item creation API
- delivery creation / status model
- pending-item fetch, ack, viewed, inspection, and file-download endpoints needed by the CLI
- reusable headless client core shared by the CLI, automated tests, macOS, and the mobile app
- local device-profile storage with active-device selection, last-used targets, and handled-delivery tracking
- CLI device registration using invite link or manual code
- CLI send flows for text, URL, and file
- CLI receive flows for pending fetch, ack, viewed, and file download
- platform-profile simulation for `cli`, `macos`, `ios`, and `android`
- end-to-end test scenarios covering multi-target sends, offline receive, delivery deduplication, and multi-file bundles
- backend hardening around the first headless vertical slice

### Milestone 1: macOS app shell

Goal: establish the native macOS receiver shell and basic UX after the headless harness proves the core behavior.

Deliverables:

- minimal menu bar app prototype
- launch-at-login behavior identified and tested
- ability to fetch from Pi over Tailnet
- native notification path tested
- evidence that URL/text opening behavior works as intended

### Milestone 2: macOS app sender + receiver

Deliverables:

- sender flows from the app UI
- file upload from the app UI
- receive URL/text/file according to chosen behavior
- deduplication by delivery ID
- status updates back to server
- browser-specific send integration explicitly deferred to a possible future Chromium extension

### Milestone 3: shared mobile app foundation

Deliverables:

- `packages/mobile-app` foundation
- shared React-based mobile web UI inside Capacitor
- Capacitor `ios` and `android` shells
- registration via invite link / QR / code
- atomic mobile registration with push permission + native push registration + token upload
- APNs setup for iOS
- FCM setup for Android
- notification handling
- item fetch on tap
- text detail screen
- file detail / download screen
- URL handoff to the default browser
- proper error handling for Tailnet/server unavailability

### Milestone 4: shared mobile send flows

Deliverables:

- mobile app send UI for text, URLs, and files
- target confirmation UI with preselected last-used devices
- shared handling for text/URL/file sends from within the app
- foreground in-app delivery handling with no auto-navigation

### Milestone 5: native share-in + mobile hardening

Deliverables:

- iOS share text/URL directly from share sheet where feasible
- iOS file-share handoff to the main app if needed
- Android OS share-sheet integration for text/URL/file
- preserved multi-file bundle semantics on both platforms
- documented minimum native integrations where pure Capacitor is insufficient
- notification tap routing verified end-to-end on both platforms

## Initial API sketch

This is not final, but it is the shape the implementation should likely converge on.

### Registration endpoints

- `POST /invites`
- `POST /devices/register`
  - `pushRegistration` is required for `ios` and `android`
  - `pushRegistration` is absent for `cli`, `macos`, and `generic`
  - for mobile devices, registration stores the device and initial push token atomically

### Send / upload

- `POST /items/text`
- `POST /items/url`
- `POST /items/file` (accepts one or more uploaded files as a single file item)

### Delivery

- `GET /deliveries/pending`
- `GET /deliveries`
- `GET /deliveries/:deliveryId`
- `POST /deliveries/:deliveryId/ack`
- `POST /deliveries/:deliveryId/viewed`

### Item inspection / download

- `GET /items`
- `GET /items/:itemId`
- `GET /deliveries/:deliveryId/download`

### Device metadata

- `POST /devices/:deviceId/push-token` for post-registration token refresh
- `GET /devices`

## Non-goals for v1

- Public internet access to the Pi server
- Complex auth beyond Tailnet + per-device token
- URL metadata scraping
- Local recipient archive/cache
- Archive browsing UI
- Search/filtering beyond simple future listing
- Encryption at rest
- File auto-download or auto-open
- Browser-specific macOS send integration such as current-tab or selected-text capture
- A polished TUI in the first implementation; the CLI is enough to start, and any later TUI should wrap the same headless client core
- Exact-once delivery guarantees
- Android PWA or mobile-web fallback

## Success criteria for v1

The system is successful when all of the following are true:

1. The CLI can exercise registration, sending, receiving, delivery acknowledgements, viewed transitions, and file downloads without needing any native client.
2. A registered sender can send text, URLs, and files to one or more devices.
3. The Pi stores every item locally and durably.
4. Offline recipients receive pending items after reconnecting.
5. Android app recipients get useful notifications with preview content.
6. iOS recipients get useful notifications with preview content.
7. Tapping iOS and Android notifications opens the expected destination by payload type.
8. The macOS app handles URL/text/file according to the chosen rules.
9. Duplicate delivery attempts do not cause duplicate handling.
10. Delivery and viewed state are tracked per target device.

## Recommended immediate next step

Implement **Milestone 0: Core backend foundation + headless CLI test harness** first as the initial vertical slice through the system. Build just enough backend surface and CLI capability to support real registration, send, receive, ack, viewed, inspection, and file-download flows from the terminal.
