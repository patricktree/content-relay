import { randomUUID } from "node:crypto";

import {
  devicePlatformSchema,
  isMobileDevicePlatform,
  pushRegistrationSchema,
  type DevicePlatform,
  type PushRegistration,
} from "@content-relay/contracts";

import { getDiContainer } from "#src/dependency-container-context.ts";
import { RelayInvalidInputError } from "#src/errors.ts";
import { clockToken } from "#src/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";
import { relayHubBaseUrlToken } from "#src/use-cases/shared.ts";

export type RegisterDeviceInput = {
  nickname: string;
  platform: string;
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

  const now = clock.now();

  const platform = devicePlatformSchema.parse(input.platform);
  const pushRegistration = parsePushRegistration(platform, input.pushRegistration);
  const nickname = input.nickname.trim();
  const existingDevice = await repository.findActiveDeviceByNickname(nickname);

  if (existingDevice !== null) {
    return {
      deviceId: existingDevice.id,
      nickname: existingDevice.nickname,
      platform: existingDevice.platform,
      relayHubBaseUrl,
      createdAt: existingDevice.createdAt,
    };
  }

  const deviceId = `dev_${randomUUID()}`;

  await repository.createRegisteredDevice({
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
