import { z } from "zod";

import { deliveryListStateSchema } from "@content-relay/contracts";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayInvalidInputError } from "#pkg/errors.ts";
import {
  relayRepositoryToken,
  type DeliveryListCursor,
  type DeliveryRecord,
} from "#pkg/interfaces/relay-hub-repository.interface.ts";
import { loadDelivery, type LoadedDelivery } from "#pkg/use-cases/load-delivery.ts";

const deliveryListCursorSchema = z.object({
  createdAt: z.string().min(1),
  deliveryId: z.string().min(1),
});

export type ListDeliveriesInput = {
  targetDeviceId: string;
  state: string;
  limit: number;
  cursor?: string | undefined;
};

export type ListDeliveriesOutput = {
  deliveries: LoadedDelivery[];
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
};

export async function listDeliveries(input: ListDeliveriesInput): Promise<ListDeliveriesOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const normalizedState = deliveryListStateSchema.parse(input.state);
  const cursor = input.cursor === undefined ? undefined : decodeDeliveryListCursor(input.cursor);
  const fetchedDeliveries = await repository.listDeliveriesForTarget(
    input.targetDeviceId,
    normalizedState,
    input.limit + 1,
    cursor,
  );

  const deliveries = fetchedDeliveries.slice(0, input.limit);
  const hasNextPage = fetchedDeliveries.length > input.limit;
  const nextCursor = hasNextPage
    ? encodeDeliveryListCursor(deliveries[deliveries.length - 1])
    : null;

  return {
    deliveries: await Promise.all(deliveries.map(async (delivery) => await loadDelivery(delivery))),
    pageInfo: {
      nextCursor,
      hasNextPage,
    },
  };
}

function decodeDeliveryListCursor(cursor: string): DeliveryListCursor {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const payload: unknown = JSON.parse(decoded);

    return deliveryListCursorSchema.parse(payload);
  } catch {
    throw new RelayInvalidInputError("Malformed delivery list cursor.");
  }
}

function encodeDeliveryListCursor(delivery: DeliveryRecord | undefined): string {
  if (delivery === undefined) {
    throw new Error("Expected a delivery to encode as the next page cursor.");
  }

  return Buffer.from(
    JSON.stringify({
      createdAt: delivery.createdAt,
      deliveryId: delivery.id,
    }),
  ).toString("base64url");
}
