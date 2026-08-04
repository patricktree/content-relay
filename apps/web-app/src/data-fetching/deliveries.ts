import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import React from "react";
import { Temporal } from "temporal-polyfill";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeliveryListResponse, DeliveryResource, DeviceId } from "@content-relay/contracts";

import { addAndroidResumeListener } from "#src/platform/app-lifecycle.android.js";

const DELIVERY_LIST_PAGE_SIZE = 50;
const DELIVERY_LIST_STATE = "all";

type DeliveryHistoryOpts = {
  relayHubUrl: string;
  deviceId: DeviceId;
};

type DeliveryHistory = {
  deliveries: DeliveryResource[];
  canRefresh: boolean;
  refreshNewest: () => Promise<void>;
  isRefreshingNewest: boolean;
  refreshNewestError: unknown;
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
  isLoadingOlder: boolean;
  loadOlderError: Error | null;
  markViewed: (deliveryId: string) => void;
  resetMarkViewed: () => void;
  isMarkingViewed: boolean;
  markViewedError: Error | null;
};

export function useDeliveryHistory(opts: DeliveryHistoryOpts): DeliveryHistory {
  const { deviceId, relayHubUrl } = opts;
  const queryClient = useQueryClient();
  const deliveriesQuery = useSuspenseInfiniteQuery(createDeliveriesQuery(opts));
  const markDeliveryViewedMutation = useMutation({
    mutationFn: async (deliveryId: string) => {
      return parseOkResponse(
        new RpcClient(relayHubUrl)
          .createDeviceRpcClient(deviceId)
          .markDeliveryViewed({ deliveryId }),
      );
    },
    onSuccess: async () => {
      await refreshDeliveryHistory(queryClient, { deviceId, relayHubUrl });
    },
  });
  const [isRefreshingNewest, setIsRefreshingNewest] = React.useState(false);
  const [refreshNewestError, setRefreshNewestError] = React.useState<unknown>(null);

  React.useEffect(
    function refreshDeliveryHistoryOnAndroidResume() {
      const listenerHandlePromise = addAndroidResumeListener(() => {
        void refreshDeliveryHistory(queryClient, { deviceId, relayHubUrl });
      });

      return () => {
        void listenerHandlePromise.then((listenerHandle) => listenerHandle?.remove());
      };
    },
    [deviceId, relayHubUrl, queryClient],
  );

  async function refreshNewest(): Promise<void> {
    setIsRefreshingNewest(true);
    setRefreshNewestError(null);

    try {
      await refreshDeliveryHistory(queryClient, { deviceId, relayHubUrl });
    } catch (error) {
      setRefreshNewestError(error);
    } finally {
      setIsRefreshingNewest(false);
    }
  }

  async function loadOlder(): Promise<void> {
    if (deliveriesQuery.isFetchingNextPage) {
      return;
    }

    await deliveriesQuery.fetchNextPage();
  }

  return {
    deliveries: mergeDeliveryPages(deliveriesQuery.data.pages),
    canRefresh:
      !isRefreshingNewest && !deliveriesQuery.isFetching && !deliveriesQuery.isFetchingNextPage,
    refreshNewest,
    isRefreshingNewest,
    refreshNewestError,
    hasOlder: deliveriesQuery.hasNextPage,
    loadOlder,
    isLoadingOlder: deliveriesQuery.isFetchingNextPage,
    loadOlderError: deliveriesQuery.isFetchNextPageError ? deliveriesQuery.error : null,
    markViewed: markDeliveryViewedMutation.mutate,
    resetMarkViewed: markDeliveryViewedMutation.reset,
    isMarkingViewed: markDeliveryViewedMutation.isPending,
    markViewedError: markDeliveryViewedMutation.error,
  };
}

function createDeliveriesQuery(opts: DeliveryHistoryOpts) {
  return infiniteQueryOptions({
    queryFn: async ({ pageParam }) => {
      return listDeliveryPage({ ...opts, cursor: pageParam });
    },
    queryKey: createDeliveriesQueryKey(opts),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
  });
}

async function refreshDeliveryHistory(
  queryClient: QueryClient,
  opts: DeliveryHistoryOpts,
): Promise<void> {
  const queryKey = createDeliveriesQueryKey(opts);
  const oldData =
    queryClient.getQueryData<InfiniteData<DeliveryListResponse, string | undefined>>(queryKey);
  const pagesToRefresh = Math.max(oldData?.pages.length ?? 0, 1);
  const refreshedData = await listDeliveryPages(opts, pagesToRefresh);

  queryClient.setQueryData(queryKey, refreshedData);
}

async function listDeliveryPages(
  opts: DeliveryHistoryOpts,
  pageCount: number,
): Promise<InfiniteData<DeliveryListResponse, string | undefined>> {
  const pages: DeliveryListResponse[] = [];
  const pageParams: (string | undefined)[] = [];
  let cursor: string | undefined;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = await listDeliveryPage({ ...opts, cursor });
    pages.push(page);
    pageParams.push(cursor);
    cursor = page.pageInfo.nextCursor ?? undefined;

    if (cursor === undefined) {
      break;
    }
  }

  return { pages, pageParams };
}

function mergeDeliveryPages(pages: DeliveryListResponse[]): DeliveryResource[] {
  const deliveriesById = new Map<string, DeliveryResource>();

  for (const page of pages) {
    for (const delivery of page.deliveries) {
      if (!deliveriesById.has(delivery.deliveryId)) {
        deliveriesById.set(delivery.deliveryId, delivery);
      }
    }
  }

  return [...deliveriesById.values()].sort((left, right) => {
    return (
      Temporal.Instant.from(right.createdAt).epochMilliseconds -
      Temporal.Instant.from(left.createdAt).epochMilliseconds
    );
  });
}

function createDeliveriesQueryKey(opts: DeliveryHistoryOpts) {
  return [
    "deliveries",
    opts.relayHubUrl,
    opts.deviceId,
    { state: DELIVERY_LIST_STATE, limit: DELIVERY_LIST_PAGE_SIZE },
  ] as const;
}

async function listDeliveryPage(
  opts: DeliveryHistoryOpts & { cursor?: string | undefined },
): Promise<DeliveryListResponse> {
  return parseOkResponse(
    new RpcClient(opts.relayHubUrl).createDeviceRpcClient(opts.deviceId).listDeliveries({
      state: DELIVERY_LIST_STATE,
      limit: DELIVERY_LIST_PAGE_SIZE,
      ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}),
    }),
  );
}
