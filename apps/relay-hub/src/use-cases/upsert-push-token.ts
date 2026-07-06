import { randomUUID } from "node:crypto";

import { getDiContainer } from "#src/dependency-container-context.ts";
import { clockToken } from "#src/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";

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
