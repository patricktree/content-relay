import { hc, parseResponse, DetailedError as HonoDetailedError } from "hono/client";

import { type AuthHeaders } from "@content-relay/contracts";
import type { Client, RelayApiApp } from "@content-relay/relay-hub";

import type { IsAny } from "type-fest";

export { parseResponse as parseOkResponse };

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

/** Maps properties of type `any` to `unknown`, leaving other types untouched. */
type MapAnyToUnknown<T> = {
  [K in keyof T]: IsAny<T[K]> extends true ? unknown : T[K];
};

type ParseResponseError = MapAnyToUnknown<HonoDetailedError>;

export function isParseResponseError(error: unknown): error is ParseResponseError {
  return (
    error instanceof HonoDetailedError ||
    (typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      "message" in error &&
      typeof error.message === "string")
  );
}

export function extractErrorMessageFromParseResponseError(
  error: ParseResponseError,
): string | undefined {
  const detailData =
    typeof error.detail === "object" && error.detail !== null && "data" in error.detail
      ? error.detail.data
      : undefined;

  if (typeof detailData === "string") {
    return detailData;
  }

  if (
    detailData !== null &&
    typeof detailData === "object" &&
    "error" in detailData &&
    typeof detailData.error === "string"
  ) {
    return detailData.error;
  }

  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
