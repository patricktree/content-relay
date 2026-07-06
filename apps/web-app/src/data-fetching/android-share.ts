import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import React from "react";

import {
  addAndroidShareListener,
  closeAndroidShareOverlay,
  completeAndroidShareOverlay,
  consumePendingAndroidShare,
  type ShareDraft,
} from "#src/platform/share-plugin.android.js";

const pendingAndroidShareQueryKey = ["android-share", "pending"] as const;

export function createPendingAndroidShareQuery() {
  return {
    queryFn: consumePendingAndroidShare,
    queryKey: pendingAndroidShareQueryKey,
    retry: false,
    gcTime: Infinity,
    staleTime: Infinity,
  };
}

export function useSyncAndroidSharesToTanstackQuery(): void {
  const queryClient = useQueryClient();

  React.useEffect(
    function subscribeToAndroidShares() {
      const listenerHandlePromise = addAndroidShareListener((shareDraft) => {
        queryClient.setQueryData(pendingAndroidShareQueryKey, shareDraft);
      });

      return () => {
        void listenerHandlePromise.then((listenerHandle) => listenerHandle?.remove());
      };
    },
    [queryClient],
  );
}

export function useCompleteAndroidShareMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: completeAndroidShareOverlay,
    onSuccess: () => {
      clearPendingAndroidShare(queryClient);
    },
  });
}

export function useCloseAndroidShareMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: closeAndroidShareOverlay,
    onSettled: () => {
      clearPendingAndroidShare(queryClient);
    },
  });
}

function clearPendingAndroidShare(queryClient: QueryClient): void {
  queryClient.setQueryData<ShareDraft | null>(pendingAndroidShareQueryKey, null);
}
