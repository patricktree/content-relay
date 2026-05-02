import { listDeliveries } from "#pkg/use-cases/list-deliveries.ts";
import { type LoadedDelivery } from "#pkg/use-cases/load-delivery.ts";

export async function listPendingDeliveries(targetDeviceId: string): Promise<LoadedDelivery[]> {
  return await listDeliveries(targetDeviceId, "pending", 100);
}
