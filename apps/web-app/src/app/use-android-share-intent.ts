import React from "react";

import {
  createAndroidShareIntake,
  type ShareDraft,
} from "#src/application/android-share-intake.js";
import { capacitorAndroidShareAdapter } from "#src/platform/share-plugin.android.js";

const androidShareIntake = createAndroidShareIntake(capacitorAndroidShareAdapter);

type AndroidShareIntent = {
  draft: ShareDraft | null;
  isLoading: boolean;
  isSettling: boolean;
  cancel: () => Promise<void>;
  complete: () => Promise<void>;
};

export function useAndroidShareIntent(): AndroidShareIntent {
  const [draft, setDraft] = React.useState<ShareDraft | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSettling, setIsSettling] = React.useState(false);
  const [error, setError] = React.useState<unknown>();

  React.useEffect(function subscribeToAndroidShareIntake() {
    let isDisposed = false;
    let removeListener: (() => Promise<void>) | undefined;

    void androidShareIntake
      .subscribe((nextDraft) => {
        if (!isDisposed) {
          setDraft(nextDraft);
          setIsLoading(false);
        }
      })
      .then((remove) => {
        if (isDisposed) {
          return remove();
        }

        removeListener = remove;
        return undefined;
      })
      .catch((subscriptionError: unknown) => {
        if (!isDisposed) {
          setError(subscriptionError);
        }
      });

    return () => {
      isDisposed = true;
      void removeListener?.().catch((cleanupError: unknown) => {
        console.error("Failed to remove the Android share listener.", cleanupError);
      });
    };
  }, []);

  async function settle(action: () => Promise<void>): Promise<void> {
    setIsSettling(true);

    try {
      await action();
    } finally {
      setIsSettling(false);
    }
  }

  if (error !== undefined) {
    throw error;
  }

  return {
    draft,
    isLoading,
    isSettling,
    cancel: () => settle(() => androidShareIntake.cancel()),
    complete: () => settle(() => androidShareIntake.complete()),
  };
}
