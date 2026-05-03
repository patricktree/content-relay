import { randomUUID } from "node:crypto";

import {
  devicePlatformSchema,
  isMobileDevicePlatform,
  pushRegistrationSchema,
  type DevicePlatform,
  type PushRegistration,
} from "@content-relay/shared";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayInvalidInputError } from "#pkg/errors.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { normalizeInvite, relayHubBaseUrlToken } from "#pkg/use-cases/shared.ts";

export type RegisterDeviceInput = {
  nickname: string;
  platform: string;
  invite: string;
  pushRegistration?: PushRegistration | undefined;
};

export type RegisterDeviceOutput = {
  deviceId: string;
  nickname: string;
  platform: DevicePlatform;
  relayHubBaseUrl: string;
  createdAt: string;
};

export async function registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);
  const relayHubBaseUrl = getDiContainer().inject(relayHubBaseUrlToken);

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
  const pushRegistration = parsePushRegistration(platform, input.pushRegistration);
  const nickname = input.nickname.trim();
  const deviceId = `dev_${randomUUID()}`;

  await repository.createDeviceRegistration({
    inviteId: invite.id,
    usedAt: now,
    device: {
      id: deviceId,
      nickname,
      platform,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    ...(pushRegistration === undefined
      ? {}
      : {
          pushToken: {
            id: `push_${randomUUID()}`,
            deviceId,
            token: pushRegistration.token,
            createdAt: now,
            updatedAt: now,
          },
        }),
  });

  return {
    deviceId,
    nickname,
    platform,
    relayHubBaseUrl,
    createdAt: now,
  };
}

function parsePushRegistration(
  platform: DevicePlatform,
  pushRegistration: PushRegistration | undefined,
): PushRegistration | undefined {
  if (isMobileDevicePlatform(platform)) {
    if (pushRegistration === undefined) {
      throw new RelayInvalidInputError(
        "Mobile registration requires pushRegistration for ios and android devices.",
      );
    }

    return pushRegistrationSchema.parse(pushRegistration);
  }

  if (pushRegistration !== undefined) {
    throw new RelayInvalidInputError(
      "pushRegistration is only allowed for ios and android devices.",
    );
  }

  return undefined;
}
