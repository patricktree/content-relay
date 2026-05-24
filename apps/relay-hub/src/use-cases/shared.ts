import { Token } from "dioma";

import { assertValidAbsoluteUrl } from "@content-relay/contracts";

export const relayHubBaseUrlToken = new Token<string>("RelayHubBaseUrl");

export function isLikelyUrl(value: string): boolean {
  try {
    return value.trim() === assertValidAbsoluteUrl(value.trim());
  } catch {
    return false;
  }
}
