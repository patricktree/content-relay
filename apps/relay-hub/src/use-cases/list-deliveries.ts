import { deliveryListStateSchema } from "@content-relay/contracts";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { loadDelivery, type LoadedDelivery } from "#pkg/use-cases/load-delivery.ts";

export async function listDeliveries(
  targetDeviceId: string,
  state: string,
  limit: number,
): Promise<LoadedDelivery[]> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const normalizedState = deliveryListStateSchema.parse(state);
  const deliveries = await repository.listDeliveriesForTarget(
    targetDeviceId,
    normalizedState,
    limit,
  );

  return await Promise.all(deliveries.map(async (delivery) => await loadDelivery(delivery)));
}
