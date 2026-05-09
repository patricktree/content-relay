import {
  parseOkResponse,
  rpcClient,
  simulatePlatformDelivery,
  type SimulatedDeliveryResult,
} from "@content-relay/client";
import type { DeliveryResource } from "@content-relay/contracts";
import type {
  LocalDeviceProfile,
  LocalDeviceProfileStore,
} from "@content-relay/profile-store-node";

import { transitionDeliveryToDelivered } from "#pkg/use-cases/transition-delivery-to-delivered.ts";

export type ReceivedDeliveryResult = {
  delivery: DeliveryResource;
  wasDuplicate: boolean;
  simulation: SimulatedDeliveryResult | null;
};

type ReceivePendingDeliveriesProfileStore = Pick<
  LocalDeviceProfileStore,
  "hasHandledDelivery" | "recordHandledDelivery"
>;

export async function receivePendingDeliveries(
  profile: LocalDeviceProfile,
  profileStore: ReceivePendingDeliveriesProfileStore,
): Promise<ReceivedDeliveryResult[]> {
  const pending = await parseOkResponse(rpcClient.fetchPendingDeliveries(profile));
  const results: ReceivedDeliveryResult[] = [];

  for (const delivery of pending.deliveries) {
    const wasDuplicate = await profileStore.hasHandledDelivery(
      profile.profileId,
      delivery.deliveryId,
    );
    const simulation = simulatePlatformDelivery(profile.platform, delivery);

    if (!wasDuplicate) {
      await profileStore.recordHandledDelivery(profile.profileId, delivery.deliveryId);
    }

    let currentDelivery = await transitionDeliveryToDelivered(profile, delivery.deliveryId);

    if (simulation.shouldMarkViewed && !wasDuplicate) {
      const viewed = await parseOkResponse(
        rpcClient.markDeliveryViewed(profile, delivery.deliveryId),
      );
      currentDelivery = viewed.delivery;
    }

    results.push({
      delivery: currentDelivery,
      wasDuplicate,
      simulation,
    });
  }

  return results;
}
