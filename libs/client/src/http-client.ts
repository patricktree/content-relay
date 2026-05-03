import { hc, parseResponse, DetailedError } from "hono/client";

import type { Client, RelayApiApp } from "@content-relay/relay-hub";
import { type AuthHeaders } from "@content-relay/shared";

export { parseResponse as parseOkResponse, DetailedError as ParseOkResponseDetailedError };

const hcWithType = (...args: Parameters<typeof hc>): Client => hc<RelayApiApp>(...args);

// workaround #1 of https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
type HcClient = ReturnType<typeof hcWithType>;

export type CreateHttpClientOptions = {
  relayHubBaseUrl: string;
};

export type CreateDeviceHttpClientOptions = CreateHttpClientOptions & {
  deviceId: string;
};

export function createHttpClient(opts: CreateHttpClientOptions): HcClient {
  return hcWithType(trimTrailingSlash(opts.relayHubBaseUrl), {});
}

export function createDeviceHttpClient(opts: CreateDeviceHttpClientOptions): HcClient {
  return hcWithType(trimTrailingSlash(opts.relayHubBaseUrl), {
    headers: {
      "x-relay-device-id": opts.deviceId,
    } as const satisfies AuthHeaders,
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
