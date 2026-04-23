# content-relay Plan

## Goal

Build a personal cross-device system that lets Patrick send **text**,
**URLs**, and **files** from one device to another and have the
recipient handle them automatically where possible.

Supported recipient platforms:

- **Android** via an installable **PWA**
- **iOS** via a native React Native app
- **macOS** via a **Brave/Chromium extension**

The central server runs on a **Raspberry Pi inside the Tailnet**.

## Desired behavior

### Payload types

- **Text**
  - macOS / Brave: auto-open in a dedicated extension tab
  - iOS: show notification, tap opens app text screen
  - Android: show notification, tap opens PWA text screen
- **URL**
  - macOS / Brave: auto-open in a background tab
  - iOS: show notification, tap opens default browser
  - Android: show notification, tap opens browser
- **File**
  - all platforms: show notification only
  - tap opens an item detail screen / UI where the file can be downloaded manually

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
- **Android PWA UI**
- **Android OS share sheet into the PWA**
- **Brave extension UI**
- **Brave toolbar / context menu**
- **CLI**

### Targeting

- A send can target **one or more explicit devices**.
- Default target selection uses the **last-used target(s)**.
- Send flows should **preselect** the last-used target(s) but still
  show a confirmation UI.

### Device identity

- Devices use **custom nicknames only** in the UI/history.
- The CLI is its **own registered device**.

### Registration

- New devices join via an **invite/link flow**.
- Support both:
  - **deep link / QR code**
  - **manual one-time code** fallback
- Invites are **single-use** and **short-lived**.

### Connectivity and trust model

- The system is **Tailnet-only**.
- Every participating device must have **Tailscale installed and connected**.
- Clients still use **per-device secrets/tokens** after registration.
- No public internet fallback for the Pi server.

## Platform behavior

### iOS

- Build a **bare React Native app** from day one.
- Use **direct APNs**.
- Mobile behavior is **notification-first only**; no auto-open in the background.
- Notifications should show:
  - text: **truncated preview**
  - URL: **URL string**
  - file: **filename**
- Tapping notifications should:
  - URL -> open default browser
  - text -> open app text screen
  - file -> open app file detail / download screen
- If the app cannot reach the Pi over Tailnet when opening an item, it
  should **fail immediately with a clear error**.

#### iOS sending

- **Text/URLs**: upload directly from the share flow
- **Files**: hand off from the share flow to the main app for upload

### Android

- Build Android as an installable **PWA**, not a native React Native app.
- The PWA must support being a **share target** on Android for text,
  URLs, and files if the platform/browser permits it.
- Use **Web Push** for notifications if supported in the installed PWA.
- Android behavior is **notification-first only**; no auto-open in the
  background.
- Notifications should show:
  - text: **truncated preview**
  - URL: **URL string**
  - file: **filename**
- Tapping notifications should:
  - URL -> open the URL in the browser
  - text -> open the PWA text screen
  - file -> open the PWA file detail / download screen
- If the PWA cannot reach the Pi over Tailnet when opening an item, it
  should **fail immediately with a clear error**.

#### Android sending

- Primary Android send surface is the **OS share sheet into the PWA**.
- The PWA should accept incoming shared **text**, **URLs**, and **files**
  via the Web Share Target flow where supported.
- If file-share behavior has browser-specific limitations, document the
  exact fallback rather than silently failing.

### macOS / Brave

- Preferred macOS receiver is a **Brave extension**, not a native app.
- If Brave is **closed**, delivery can wait until Brave is opened again.
- If Brave is **open** and receiving works, then:
  - URL -> auto-open in a **background tab**
  - text -> auto-open in a **dedicated extension tab**
  - file -> notification only
- If URL/text auto-open already happened, do **not** also show a browser notification.
- Assume **Brave is the default browser** on this device in v1.

## Major risk / feasibility gate

The highest-risk requirement is:

> The Brave extension must be able to receive deliveries in the
> background with **no visible page or tab open**.

This is a **must-pass feasibility gate** before the rest of the macOS
architecture is considered committed.

### Current direction

- Keep researching an **extension-only** solution first.
- It is acceptable for the extension to depend on
  **Chromium/Web Push infrastructure** for wakeups/previews.
- Actual item data still comes from the **Pi over Tailnet**.

### Open question

The exact success criteria for the feasibility spike were not finalized
in the interview.

**Proposed success bar:**

1. Brave extension wakes in the background with no visible page/tab
2. Extension authenticates to the Pi
3. Extension fetches pending items over Tailnet
4. Extension deduplicates by delivery ID
5. Extension auto-opens URL/text appropriately

If this is not possible, the macOS architecture must be revisited.

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

Rules:

- No URL metadata fetching in v1
- Optional custom title supported
- URL detection rule for senders:
  - if payload is a **single-line valid URL**, treat it as a URL
  - otherwise treat it as text

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
3. Server attempts to notify / wake recipients
4. Recipient fetches item from server
5. Recipient acknowledges delivery
6. Recipient marks viewed after user open

### Sender-side semantics

- Send succeeds when the server has **accepted and stored** the item.
- If the server is unreachable while sending, **fail immediately with a clear error**.
- Sender should be able to inspect **per-device status** later:
  - pending
  - delivered
  - viewed

## Client-specific notes

### Brave sender capabilities

The Brave extension should support all of the following in v1:

- send current page URL
- send right-clicked link URL
- send selected text
- manual paste/input UI
- file upload from extension UI

### iOS local storage

- Do **not** keep a persistent local copy of delivered items in v1
- Only minimal local state is needed, such as:
  - device credentials
  - handled delivery IDs for deduplication
  - last-used targets

### Android local storage

- Do **not** keep a persistent local copy of delivered items in v1
- Only minimal local state is needed, such as:
  - device credentials
  - handled delivery IDs for deduplication
  - last-used targets

## Suggested milestone plan

### Milestone 0: Brave feasibility spike

Goal: prove or disprove the extension-only macOS receive architecture.

Deliverables:

- minimal Brave extension prototype
- background wake mechanism identified and tested
- ability to fetch from Pi over Tailnet
- evidence of whether auto-open is possible with no visible page/tab
- written conclusion and fallback recommendation if it fails

This milestone gates the macOS receiver architecture.

### Milestone 1: Core backend foundation

Deliverables:

- Node.js / TypeScript server
- SQLite schema
- filesystem blob storage
- invite creation + device registration
- per-device token auth
- item creation API
- delivery creation / status model
- basic pending-item fetch + ack endpoints

### Milestone 2: CLI sender

Deliverables:

- CLI registered as its own device
- send text, URL, file
- target selection with last-used defaults
- clear server-unreachable errors
- optional title support

### Milestone 3: Brave sender + receiver

Deliverables:

- sender flows from toolbar/context menu/manual UI
- file upload from extension UI
- receive URL/text/file according to chosen behavior
- deduplication by delivery ID
- status updates back to server

If Milestone 0 fails, replace this with the revised macOS architecture.

### Milestone 4: Android PWA foundation

Deliverables:

- Android PWA foundation
- registration via invite link / QR / code
- per-device token auth
- Web Push setup for Android PWA
- notification handling
- item fetch on tap
- text detail screen
- file detail / download screen
- proper error handling for Tailnet/server unavailability

### Milestone 5: Android sharing flows

Deliverables:

- Android PWA Web Share Target flow for text/URL/file where supported
- Android PWA send UI
- target confirmation UI with preselected last-used devices
- documented fallback behavior for unsupported browser/file-share cases

### Milestone 6: iOS app foundation

Deliverables:

- bare React Native iOS project
- registration via invite link / QR / code
- per-device token auth
- APNs setup for iOS
- notification handling
- item fetch on tap
- text detail screen
- file detail / download screen
- proper error handling for Tailnet/server unavailability

### Milestone 7: iOS share flows

Deliverables:

- iOS share text/URL directly from share sheet
- iOS hand off file shares to main app for upload
- target confirmation UI with preselected last-used devices

## Initial API sketch

This is not final, but it is the shape the implementation should likely
converge on.

### Registration endpoints

- `POST /invites`
- `POST /devices/register`

### Send / upload

- `POST /items/text`
- `POST /items/url`
- `POST /items/file`

### Delivery

- `GET /deliveries/pending`
- `POST /deliveries/:deliveryId/ack`
- `POST /deliveries/:deliveryId/viewed`

### Device metadata

- `POST /devices/:deviceId/push-token`
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
- Exact-once delivery guarantees

## Success criteria for v1

The system is successful when all of the following are true:

1. A registered sender can send text, URLs, and files to one or more devices.
2. The Pi stores every item locally and durably.
3. Offline recipients receive pending items after reconnecting.
4. Android PWA recipients get useful notifications with preview content.
5. iOS recipients get useful notifications with preview content.
6. Tapping iOS and Android notifications opens the expected destination by payload type.
7. Brave handles URL/text/file according to the chosen rules.
8. Duplicate delivery attempts do not cause duplicate handling.
9. Delivery and viewed state are tracked per target device.

## Recommended immediate next step

Implement **Milestone 0: Brave feasibility spike** first, because it is
the main architectural unknown. Everything else can proceed once that
constraint is either proven or rejected.
