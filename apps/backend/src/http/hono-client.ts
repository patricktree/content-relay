/**
 * based on {@link https://hono.dev/docs/guides/rpc#compile-your-code-before-using-it-recommended}
 */
import { hc } from "hono/client";

import type { createHonoApp } from "#pkg/http/hono-app.ts";

export type RelayApiApp = Awaited<ReturnType<typeof createHonoApp>>;

export type Client = ReturnType<typeof hc<RelayApiApp>>;
