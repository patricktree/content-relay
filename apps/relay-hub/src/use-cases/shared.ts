import { Token } from "dioma";
import { randomUUID } from "node:crypto";

import { assertValidAbsoluteUrl } from "@content-relay/contracts";

import { RelayInvalidInputError } from "#pkg/errors.ts";

export const relayHubBaseUrlToken = new Token<string>("RelayHubBaseUrl");

export function normalizeInvite(invite: string): string {
  if (invite.startsWith("http://") || invite.startsWith("https://")) {
    const url = new URL(invite);
    const parts = url.pathname.split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1];

    if (lastPart === undefined || lastPart.length === 0) {
      throw new RelayInvalidInputError(`Could not extract invite code from invite URL: ${invite}`);
    }

    return lastPart;
  }

  return invite.trim();
}

export function randomToken(): string {
  return randomUUID().replace(/-/g, "");
}

export function isLikelyUrl(value: string): boolean {
  try {
    return value.trim() === assertValidAbsoluteUrl(value.trim());
  } catch {
    return false;
  }
}
