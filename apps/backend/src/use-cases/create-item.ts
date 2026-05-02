import { randomUUID } from "node:crypto";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import {
  relayRepositoryToken,
  type DeliveryRecord,
  type ItemRecord,
} from "#pkg/interfaces/relay-backend-repository.interface.ts";
import { resolveTargetDevices } from "#pkg/use-cases/resolve-target-devices.ts";

export type CreateItemOutput = {
  item: ItemRecord;
  deliveries: DeliveryRecord[];
};

export async function createItem(
  sourceDeviceId: string,
  input: {
    type: "text" | "url" | "file";
    title?: string;
    text?: string;
    url?: string;
    targetDeviceIds: string[];
  },
): Promise<CreateItemOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  const createdAt = clock.now();
  const targetDevices = await resolveTargetDevices(input.targetDeviceIds);
  const itemId = `item_${randomUUID()}`;
  const item: ItemRecord = {
    id: itemId,
    type: input.type,
    title: input.title?.trim() || null,
    sourceDeviceId,
    textContent: input.text ?? null,
    url: input.url ?? null,
    createdAt,
  };

  await repository.createItem(item);

  const deliveries = targetDevices.map((deviceId) => ({
    id: `del_${randomUUID()}`,
    itemId,
    targetDeviceId: deviceId,
    state: "pending" as const,
    createdAt,
    acknowledgedAt: null,
    viewedAt: null,
  }));
  await repository.createDeliveries(deliveries);

  return {
    item,
    deliveries,
  };
}
