import { hcWithType } from "@content-relay/backend";
import { type AuthHeaders } from "@content-relay/shared";

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

function createAuthHeaders(opts: AuthOptions) {
  return {
    authorization: `Bearer ${opts.authToken}`,
    "x-relay-device-id": opts.deviceId,
  } as const satisfies AuthHeaders;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
