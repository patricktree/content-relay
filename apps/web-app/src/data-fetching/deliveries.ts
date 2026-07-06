import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import React from "react";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryListResponse, DeviceId } from "@content-relay/contracts";

import { addAndroidResumeListener } from "#src/platform/app-lifecycle.android.js";

const DELIVERY_LIST_PAGE_SIZE = 50;
const DELIVERY_LIST_STATE = "all";

type DeliveriesQueryOpts = {
  relayHubUrl: string;
  deviceId: DeviceId;
};

type MarkDeliveryViewedMutationOpts = DeliveriesQueryOpts;

export function createDeliveriesQuery(opts: DeliveriesQueryOpts) {
  return infiniteQueryOptions({
    queryFn: async ({ pageParam }) => {
      return listDeliveryPage({ ...opts, cursor: pageParam });
    },
    queryKey: createDeliveriesQueryKey(opts),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
  });
}

export function useMarkDeliveryViewedMutation(opts: MarkDeliveryViewedMutationOpts) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deliveryId: string) => {
      return parseOkResponse(
        new RpcClient(opts.relayHubUrl)
          .createDeviceRpcClient(opts.deviceId)
          .markDeliveryViewed({ deliveryId }),
      );
    },
    onSuccess: async () => {
      await refreshFirstDeliveryPage(queryClient, opts);
    },
  });
}

export function useRefreshDeliveriesOnAndroidResume(opts: DeliveriesQueryOpts): void {
  const queryClient = useQueryClient();
  const { deviceId, relayHubUrl } = opts;

  React.useEffect(
    function subscribeToAndroidResume() {
      const listenerHandlePromise = addAndroidResumeListener(() => {
        void refreshFirstDeliveryPage(queryClient, { deviceId, relayHubUrl });
      });

      return () => {
        void listenerHandlePromise.then((listenerHandle) => listenerHandle?.remove());
      };
    },
    [deviceId, relayHubUrl, queryClient],
  );
}

export async function refreshFirstDeliveryPage(
  queryClient: QueryClient,
  opts: DeliveriesQueryOpts,
): Promise<void> {
  const queryKey = createDeliveriesQueryKey(opts);
  const firstPage = await listDeliveryPage(opts);

  queryClient.setQueryData<InfiniteData<DeliveryListResponse, string | undefined>>(
    queryKey,
    (oldData) => {
      if (oldData === undefined) {
        return {
          pages: [firstPage],
          pageParams: [undefined],
        };
      }

      return {
        ...oldData,
        pages: [firstPage, ...oldData.pages.slice(1)],
        pageParams: [undefined, ...oldData.pageParams.slice(1)],
      };
    },
  );
}

function createDeliveriesQueryKey(opts: DeliveriesQueryOpts) {
  return [
    "deliveries",
    opts.relayHubUrl,
    opts.deviceId,
    { state: DELIVERY_LIST_STATE, limit: DELIVERY_LIST_PAGE_SIZE },
  ] as const;
}

async function listDeliveryPage(
  opts: DeliveriesQueryOpts & { cursor?: string | undefined },
): Promise<DeliveryListResponse> {
  return parseOkResponse(
    new RpcClient(opts.relayHubUrl).createDeviceRpcClient(opts.deviceId).listDeliveries({
      state: DELIVERY_LIST_STATE,
      limit: DELIVERY_LIST_PAGE_SIZE,
      ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}),
    }),
  );
}
