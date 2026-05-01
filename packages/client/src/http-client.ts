import { hc } from "hono/client";

import type { Client, RelayApiApp } from "@content-relay/backend";
import { type AuthHeaders } from "@content-relay/shared";

const hcWithType = (...args: Parameters<typeof hc>): Client => hc<RelayApiApp>(...args);

// workaround #1 of https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
type HcClient = ReturnType<typeof hcWithType>;

export type CreateHttpClientOptions = {
  serverBaseUrl: string;
};

export type CreateAuthenticatedHttpClientOptions = CreateHttpClientOptions & {
  authToken: string;
  deviceId: string;
};

export function createHttpClient(opts: CreateHttpClientOptions): HcClient {
  return hcWithType(trimTrailingSlash(opts.serverBaseUrl), {});
}

export function createAuthenticatedHttpClient(
  opts: CreateAuthenticatedHttpClientOptions,
): HcClient {
  return hcWithType(trimTrailingSlash(opts.serverBaseUrl), {
    headers: {
      authorization: `Bearer ${opts.authToken}`,
      "x-relay-device-id": opts.deviceId,
    } as const satisfies AuthHeaders,
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
