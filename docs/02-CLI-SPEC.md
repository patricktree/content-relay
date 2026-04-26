# content-relay CLI specification

## Purpose

The CLI is the **primary early development and testing surface** for content-relay.

It should let the developer exercise the real server and the core product behavior without needing to run the macOS app, iOS app, or Android PWA.

The CLI should cover:

- device registration
- sending text, URLs, and files
- receiving pending deliveries
- acknowledging delivery
- marking items viewed
- downloading file items
- inspecting per-device delivery status
- simulating platform behavior differences at a product level

The CLI does **not** prove native platform integrations such as APNs, Web Push, Android Web Share Target, iOS share extensions, or macOS launch-at-login behavior.

A future TUI is optional. If added, it must reuse the same headless client core and local state store as the CLI rather than implementing a separate protocol client.

## Name

- Binary name: `relay`
- One-liner: `Headless content-relay client and test harness`

## Core concepts

### Local device profile

A local device profile is a locally stored credential bundle for one registered server device.

Each profile stores:

- server base URL
- registered device ID
- hashed or securely stored auth secret as appropriate for the local runtime
- device nickname
- platform profile
- last-used targets
- handled delivery IDs used for deduplication during headless testing

### Platform profile

Each local device profile has a platform profile:

- `cli`
- `macos`
- `ios`
- `android-pwa`
- `generic`

Platform profiles affect **simulated receive behavior** only. They do not change the server protocol.

### Active device

The CLI should support multiple local device profiles.

One profile can be marked as the active device so commands do not need a repeated `--device` flag.

## Usage

```text
relay [global flags] <command> [args]
```

### Command tree

```text
relay
  device register
  device list
  device show
  device use
  device rename
  device remove
  device current

  send text
  send url
  send file

  receive once
  receive watch

  delivery list
  delivery show
  delivery ack
  delivery view
  delivery open
  delivery download

  item list
  item show
```

## Global flags

| Flag                    | Type    | Default              | Notes                                              |
| ----------------------- | ------- | -------------------- | -------------------------------------------------- |
| `--server <url>`        | string  | active profile value | Server base URL                                    |
| `--device <name-or-id>` | string  | active profile       | Local device profile to act as                     |
| `--json`                | boolean | `false`              | Emit stable machine-readable JSON to stdout        |
| `--plain`               | boolean | `false`              | Emit stable line-oriented text with no decorations |
| `-q, --quiet`           | boolean | `false`              | Suppress non-essential human output                |
| `-v, --verbose`         | boolean | `false`              | Include extra diagnostics on stderr                |
| `--no-input`            | boolean | `false`              | Disable prompts and confirmations                  |
| `--no-color`            | boolean | auto                 | Disable ANSI color                                 |
| `-h, --help`            | boolean | n/a                  | Show help and ignore other args                    |
| `--version`             | boolean | n/a                  | Print version to stdout                            |

## Device commands

### `relay device register`

Register a new device on the server and save it as a local profile.

```text
relay device register --name <nickname> --platform <platform> --invite <invite>
```

Options:

| Flag                    | Type    | Required | Notes                                           |
| ----------------------- | ------- | -------- | ----------------------------------------------- |
| `--name <nickname>`     | string  | yes      | UI nickname shown in server history             |
| `--platform <platform>` | enum    | yes      | `cli`, `macos`, `ios`, `android-pwa`, `generic` |
| `--invite <invite>`     | string  | yes      | Invite URL or one-time code                     |
| `--make-active`         | boolean | `true`   | Make the new profile the active device          |

Behavior:

- Accept either a full invite link or a manual one-time code.
- Fail fast if the invite is invalid, expired, or already used.
- Persist the new local profile only after successful registration.

### `relay device list`

List all locally stored device profiles.

### `relay device show [device]`

Show one local profile and its linked server device metadata.

Defaults to the active device if omitted.

### `relay device use <device>`

Mark a local profile as the active device.

### `relay device rename <device> --name <nickname>`

Rename the server device and update the local profile label.

### `relay device remove <device>`

Remove a local device profile.

Options:

| Flag            | Type    | Default | Notes                                             |
| --------------- | ------- | ------- | ------------------------------------------------- |
| `--forget-only` | boolean | `false` | Remove local profile only; do not call the server |
| `--force`       | boolean | `false` | Skip confirmation                                 |

### `relay device current`

Print the active local device profile.

## Send commands

All send commands use the active device unless `--device` is provided.

If `--to` is omitted, the CLI should use the active device's last-used targets.

If `--to` is omitted and no last-used targets exist, then:

- prompt on TTY
- fail with a clear error under `--no-input` or non-interactive use

### `relay send text [text]`

Send a text item.

```text
relay send text [text] [--stdin] [--title <title>] [--to <device>...] [--no-remember-targets]
```

Options:

| Flag                    | Type     | Default           | Notes                           |
| ----------------------- | -------- | ----------------- | ------------------------------- |
| `[text]`                | string   | none              | Inline text payload             |
| `--stdin`               | boolean  | auto              | Read text from stdin            |
| `--title <title>`       | string   | none              | Optional custom title           |
| `--to <device>...`      | string[] | last-used targets | One or more target devices      |
| `--no-remember-targets` | boolean  | `false`           | Do not update last-used targets |

Rules:

- If `[text]` and `--stdin` are both supplied, fail with usage error.
- If `[text]` is omitted and stdin is piped, read stdin automatically.
- If the final payload is a single-line valid URL, the command should fail and instruct the user to use `relay send url` instead. The CLI should not silently switch subcommands.

### `relay send url <url>`

Send a URL item.

```text
relay send url <url> [--title <title>] [--to <device>...] [--no-remember-targets]
```

Rules:

- Validate that `<url>` is a single valid absolute URL before sending.
- Fail fast on invalid URLs.

### `relay send file <path...>`

Send one or more files as a single logical file item.

```text
relay send file <path...> [--title <title>] [--to <device>...] [--no-remember-targets]
```

Rules:

- One invocation creates exactly one file item, even when multiple files are provided.
- Preserve input file order in metadata.
- Fail if any provided path does not exist or is not a regular file.
- Do not silently skip unreadable files.

## Receive commands

Receive commands exercise the real pull-based delivery protocol.

### `relay receive once`

Fetch pending deliveries for the selected device exactly once.

```text
relay receive once [--no-ack] [--simulate-platform]
```

Options:

| Flag                  | Type    | Default | Notes                                   |
| --------------------- | ------- | ------- | --------------------------------------- |
| `--no-ack`            | boolean | `false` | Inspect without acknowledging delivery  |
| `--simulate-platform` | boolean | `true`  | Apply platform-profile receive behavior |

### `relay receive watch`

Poll for pending deliveries on an interval.

```text
relay receive watch [--interval <duration>] [--no-ack] [--simulate-platform]
```

Options:

| Flag                    | Type     | Default | Notes                                   |
| ----------------------- | -------- | ------- | --------------------------------------- |
| `--interval <duration>` | duration | `10s`   | Poll interval                           |
| `--no-ack`              | boolean  | `false` | Inspect without acknowledging delivery  |
| `--simulate-platform`   | boolean  | `true`  | Apply platform-profile receive behavior |

### Platform-profile receive behavior

When `--simulate-platform` is enabled:

- `macos`
  - received `url` items should simulate auto-open in the default browser
  - received `text` items should simulate auto-open in a dedicated app window
  - received `file` items should remain notification-only
  - if a URL or text item auto-opens successfully, the CLI should mark it viewed automatically
- `ios`
  - receiving creates a simulated notification event only
  - the item is marked viewed only after `relay delivery open ...`
- `android-pwa`
  - receiving creates a simulated notification event only
  - the item is marked viewed only after `relay delivery open ...`
- `cli` and `generic`
  - receiving prints the delivery summary only
  - no automatic viewed transition happens

## Delivery commands

### `relay delivery list`

List deliveries for the selected device.

```text
relay delivery list [--state <state>] [--limit <n>]
```

Options:

| Flag              | Type   | Default   | Notes                                   |
| ----------------- | ------ | --------- | --------------------------------------- |
| `--state <state>` | enum   | `pending` | `pending`, `delivered`, `viewed`, `all` |
| `--limit <n>`     | number | `50`      | Max rows to render                      |

### `relay delivery show <delivery-id>`

Show one delivery and its linked item metadata.

### `relay delivery ack <delivery-id>`

Acknowledge one delivery explicitly.

### `relay delivery view <delivery-id>`

Mark one delivery as viewed without simulating an open action.

This is mainly for testing state transitions.

### `relay delivery open <delivery-id>`

Simulate the user opening a delivered item.

Behavior by item type:

- `text`
  - print the text content or a structured preview
  - mark delivery viewed on success
- `url`
  - print the URL and the action that would happen on the selected platform
  - mark delivery viewed on success
- `file`
  - print file metadata and download hints
  - do **not** auto-download files
  - do not mark viewed until the detail/open action succeeds

### `relay delivery download <delivery-id>`

Download the files attached to a file delivery.

```text
relay delivery download <delivery-id> [--out <path>]
```

Rules:

- Single-file deliveries should default to the current directory using the original filename.
- Multi-file deliveries should default to a new directory named after the item ID in the current directory.
- `--out` may point to a destination directory. For single-file deliveries, `--out` may also point to a file path.
- Downloading does not replace the explicit `view` transition unless the command also simulated opening the detail screen first.

## Item commands

### `relay item list`

List items sent by the selected device.

```text
relay item list [--limit <n>]
```

### `relay item show <item-id>`

Show one item and all per-target delivery states.

This is the primary sender-side status inspection command.

## Output rules

### stdout

Use stdout for:

- command results
- IDs
- JSON output
- plain-text tables or lists
- text payload previews when explicitly opened

### stderr

Use stderr for:

- validation failures
- diagnostics
- warnings
- watch-loop progress logs when `--verbose` is enabled

### Human output defaults

- Prefer concise tables and summaries by default.
- Respect `NO_COLOR` and `TERM=dumb`.
- Never mix decorative output into `--json` mode.

### `--json`

When `--json` is enabled:

- output a single JSON object or array to stdout
- never print human commentary to stdout
- send diagnostics to stderr only
- keep field names stable across versions unless there is a versioned break

### `--plain`

Use `--plain` for line-oriented output intended for shell pipelines.

Examples:

- `relay device list --plain`
- `relay delivery list --state pending --plain`

## Error handling and exit codes

| Code | Meaning                                 |
| ---- | --------------------------------------- |
| `0`  | Success                                 |
| `1`  | Generic runtime failure                 |
| `2`  | Invalid usage or validation failure     |
| `3`  | Local device profile or config problem  |
| `4`  | Authentication or authorization failure |
| `5`  | Server unreachable or network failure   |
| `6`  | Requested resource not found            |

Rules:

- Server-unreachable errors must be explicit and actionable.
- Missing active device configuration must tell the user how to fix it.
- Validation errors should mention the exact offending flag, argument, or file.

## Safety and interactivity rules

- Prompts are allowed only when stdin is a TTY.
- `--no-input` disables prompts and confirmations.
- `relay device remove` must prompt unless `--force` is supplied.
- Destructive or state-changing commands must never silently target the wrong device; always resolve against the active profile or explicit `--device`.
- The CLI must never print device auth secrets in normal human output.

## Config and environment

### Default storage

Use a user-scoped config and state location outside the repo.

Store at least:

- profiles
- active device selection
- last-used targets
- handled delivery IDs

### Environment variables

| Variable              | Meaning                              |
| --------------------- | ------------------------------------ |
| `RELAY_SERVER_URL`    | Default server base URL              |
| `RELAY_DEVICE`        | Default local device profile         |
| `RELAY_CONFIG_DIR`    | Override config/state directory      |
| `RELAY_POLL_INTERVAL` | Default interval for `receive watch` |

### Precedence

Precedence should be:

1. explicit flags
2. environment variables
3. user config/state
4. built-in defaults

There should be **no repo-local project config** in v1.

## Examples

```bash
# Register three simulated devices
relay device register --name "Developer CLI" --platform cli --invite "$INVITE"
relay device register --name "Developer iPhone Sim" --platform ios --invite "$INVITE"
relay device register --name "Developer Pixel Sim" --platform android-pwa --invite "$INVITE"

# Pick the sender device once
relay device use "Developer CLI"

# Send text to the last-used targets after selecting them once
relay send text "hello from the terminal" --to "Developer iPhone Sim" "Developer Pixel Sim"
relay send text "this reuses last-used targets"

# Pipe text from stdin
pbpaste | relay send text --stdin --to "Developer iPhone Sim"

# Send one logical multi-file item
relay send file ./receipt.pdf ./photo.jpg --to "Developer Pixel Sim" --title "Trip docs"

# Simulate an iPhone receiving pending items once
relay --device "Developer iPhone Sim" receive once

# Watch for new deliveries on the Android-PWA profile
relay --device "Developer Pixel Sim" receive watch --interval 5s

# Open a delivery and mark it viewed
relay --device "Developer iPhone Sim" delivery open del_123

# Download a file delivery to a folder
relay --device "Developer Pixel Sim" delivery download del_456 --out ./downloads

# Inspect sender-side item status
relay item show item_789
```

## Reserved future extension

A future `relay tui` command is allowed, but it is **not required** for the first implementation.

If added later, it must:

- reuse the same headless client core as the CLI
- reuse the same local device profile store
- preserve the same server protocol semantics
- act as a visual shell over existing commands rather than a separate client
