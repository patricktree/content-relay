import { randomUUID } from "node:crypto";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";

export async function upsertPushToken(deviceId: string, token: string): Promise<void> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  const now = clock.now();

  await repository.upsertPushToken({
    id: `push_${randomUUID()}`,
    deviceId,
    token,
    createdAt: now,
    updatedAt: now,
  });
}
