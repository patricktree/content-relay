/** Based on {@link https://hono.dev/docs/guides/rpc#compile-your-code-before-using-it-recommended} */
import { hc } from "hono/client";

import type { createRelayHubApiApp } from "#src/hono-app.ts";

export type RelayApiApp = ReturnType<typeof createRelayHubApiApp>;

export type Client = ReturnType<typeof hc<RelayApiApp>>;
