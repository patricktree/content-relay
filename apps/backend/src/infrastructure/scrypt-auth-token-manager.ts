import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { IAuthTokenManager } from "#pkg/interfaces/auth-token-manager.interface.ts";

export class ScryptAuthTokenManager implements IAuthTokenManager {
  generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  async hash(token: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = scryptSync(token, salt, 64).toString("hex");

    return `${salt}:${derivedKey}`;
  }

  async verify(token: string, hash: string): Promise<boolean> {
    const [salt, expectedHex] = hash.split(":");
    if (salt === undefined || expectedHex === undefined) {
      throw new Error("Malformed auth token hash.");
    }

    const derivedKey = scryptSync(token, salt, 64);
    const expectedKey = Buffer.from(expectedHex, "hex");

    if (derivedKey.length !== expectedKey.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, expectedKey);
  }
}
