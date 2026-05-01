import { hc } from "hono/client";

import type { Client, RelayApiApp } from "@content-relay/backend";
import { type AuthHeaders } from "@content-relay/shared";

const hcWithType = (...args: Parameters<typeof hc>): Client => hc<RelayApiApp>(...args);

export type CreateAuthenticatedClientOptions = AuthOptions & {
  serverBaseUrl: string;
};

type AuthOptions = { authToken: string; deviceId: string };

// workaround #1 of https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
type HcClient = ReturnType<typeof hcWithType>;

export function createRelayHttpClient(opts: {
  serverBaseUrl: string;
  auth?: AuthOptions;
}): HcClient {
  let headers = {};

  if (opts.auth) {
    headers = {
      ...headers,
      ...createAuthHeaders(opts.auth),
    };
  }

  return hcWithType(trimTrailingSlash(opts.serverBaseUrl), {
    headers,
  });
}

export function createAuthenticatedClient(opts: CreateAuthenticatedClientOptions): HcClient {
  return createRelayHttpClient({
    serverBaseUrl: opts.serverBaseUrl,
    auth: {
      authToken: opts.authToken,
      deviceId: opts.deviceId,
    },
  });
}

function createAuthHeaders(opts: AuthOptions) {
  return {
    authorization: `Bearer ${opts.authToken}`,
    "x-relay-device-id": opts.deviceId,
  } as const satisfies AuthHeaders;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
