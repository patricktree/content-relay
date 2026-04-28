/**
 * based on {@link https://hono.dev/docs/guides/rpc#compile-your-code-before-using-it-recommended}
 */
import { hc } from "hono/client";

import type { createHonoApp } from "./hono-app.ts";

type RelayApiApp = Awaited<ReturnType<typeof createHonoApp>>;

export type Client = ReturnType<typeof hc<RelayApiApp>>;

export const hcWithType = (...args: Parameters<typeof hc>): Client => hc<RelayApiApp>(...args);
