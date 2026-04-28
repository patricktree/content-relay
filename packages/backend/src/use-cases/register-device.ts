import { randomUUID } from "node:crypto";

import { devicePlatformSchema, type DevicePlatform } from "@content-relay/shared";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayInvalidInputError } from "#pkg/errors.ts";
import { authTokenManagerToken } from "#pkg/interfaces/auth-token-manager.interface.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-backend-repository.interface.ts";
import { normalizeInvite, serverBaseUrlToken } from "#pkg/use-cases/shared.ts";

export type RegisterDeviceInput = {
  nickname: string;
  platform: string;
  invite: string;
};

export type RegisterDeviceOutput = {
  deviceId: string;
  nickname: string;
  platform: DevicePlatform;
  authToken: string;
  serverBaseUrl: string;
  createdAt: string;
};

export async function registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const authTokenManager = getDiContainer().inject(authTokenManagerToken);
  const clock = getDiContainer().inject(clockToken);
  const serverBaseUrl = getDiContainer().inject(serverBaseUrlToken);

  const inviteCode = normalizeInvite(input.invite);
  const invite = await repository.getInviteByCode(inviteCode);
  const now = clock.now();

  if (invite === null) {
    throw new RelayInvalidInputError("Invite is invalid.");
  }

  if (invite.usedAt !== null) {
    throw new RelayInvalidInputError("Invite has already been used.");
  }

  if (invite.expiresAt <= now) {
    throw new RelayInvalidInputError("Invite has expired.");
  }

  const platform = devicePlatformSchema.parse(input.platform);
  const nickname = input.nickname.trim();
  const authToken = authTokenManager.generateToken();
  const deviceId = `dev_${randomUUID()}`;
  const authTokenHash = await authTokenManager.hash(authToken);

  await repository.createDevice({
    id: deviceId,
    nickname,
    platform,
    authTokenHash,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await repository.markInviteUsed(invite.id, now);

  return {
    deviceId,
    nickname,
    platform,
    authToken,
    serverBaseUrl,
    createdAt: now,
  };
}
