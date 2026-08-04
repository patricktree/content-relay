import { z } from "zod";

import { isValidAbsoluteUrl } from "@content-relay/contracts";

const sharePayloadSchema = z.object({
  shareId: z.uuid(),
  text: z.string().trim().min(1),
  title: z.string().trim().min(1).nullable().optional(),
});

const pendingShareResponseSchema = z.object({
  share: z.unknown().nullable().optional(),
});

export type ShareDraft = {
  shareId: string;
  itemType: "text" | "url";
  title: string;
  value: string;
};

type RemoveListener = () => Promise<void>;

export type AndroidShareAdapter = {
  isAvailable(): boolean;
  consumePendingShare(): Promise<unknown>;
  addShareListener(listener: (payload: unknown) => void): Promise<RemoveListener>;
  cancelShare(): Promise<void>;
  completeShare(input: { message: string }): Promise<void>;
};

export type AndroidShareIntake = {
  subscribe(listener: (draft: ShareDraft | null) => void): Promise<RemoveListener>;
  cancel(): Promise<void>;
  complete(): Promise<void>;
};

type NativeSession = {
  eventCount: number;
  removeListener: RemoveListener | undefined;
};

/** Owns the full Android Share Intent lifecycle behind an app-level interface. */
export function createAndroidShareIntake(adapter: AndroidShareAdapter): AndroidShareIntake {
  const subscribers = new Set<(draft: ShareDraft | null) => void>();
  let currentDraft: ShareDraft | null = null;
  let stateVersion = 0;
  let activeSession: NativeSession | null = null;
  let activeSessionReady: Promise<void> | null = null;

  function publish(draft: ShareDraft | null): void {
    currentDraft = draft;
    stateVersion += 1;

    for (const subscriber of subscribers) {
      subscriber(draft);
    }
  }

  async function connect(session: NativeSession): Promise<void> {
    if (!adapter.isAvailable()) {
      publish(null);
      return;
    }

    session.removeListener = await adapter.addShareListener((payload) => {
      const draft = parseShareDraft(payload);

      if (draft === null || activeSession !== session) {
        return;
      }

      session.eventCount += 1;
      publish(draft);
    });

    const eventCountBeforeConsumption = session.eventCount;
    const response = pendingShareResponseSchema.safeParse(await adapter.consumePendingShare());

    if (!response.success) {
      console.error("Received an invalid pending Android share response.", response.error);

      if (session.eventCount === eventCountBeforeConsumption && activeSession === session) {
        publish(null);
      }

      return;
    }

    const draft =
      response.data.share === undefined || response.data.share === null
        ? null
        : parseShareDraft(response.data.share);

    // A newly delivered Share Intent is newer than the pending value returned by consumption.
    if (session.eventCount === eventCountBeforeConsumption && activeSession === session) {
      publish(draft);
    }
  }

  async function disconnect(session: NativeSession): Promise<void> {
    if (activeSession !== session || subscribers.size > 0) {
      return;
    }

    activeSession = null;
    activeSessionReady = null;
    currentDraft = null;
    stateVersion += 1;
    await session.removeListener?.();
  }

  return {
    async subscribe(listener) {
      subscribers.add(listener);
      const versionBeforeConnection = stateVersion;

      if (activeSession === null) {
        const session: NativeSession = { eventCount: 0, removeListener: undefined };
        activeSession = session;
        activeSessionReady = connect(session).catch(async (error: unknown) => {
          if (activeSession === session) {
            activeSession = null;
            activeSessionReady = null;
          }

          await session.removeListener?.();
          throw error;
        });
      }

      const subscribedSession = activeSession;

      try {
        await activeSessionReady;
      } catch (error: unknown) {
        subscribers.delete(listener);
        throw error;
      }

      if (stateVersion === versionBeforeConnection) {
        listener(currentDraft);
      }

      return async () => {
        subscribers.delete(listener);
        await disconnect(subscribedSession);
      };
    },

    async cancel() {
      const pendingShareId = currentDraft?.shareId;

      if (pendingShareId === undefined) {
        throw new Error("Expected an Android Share Intent to be pending.");
      }

      try {
        await adapter.cancelShare();
      } finally {
        if (currentDraft?.shareId === pendingShareId) {
          publish(null);
        }
      }
    },

    async complete() {
      const pendingShareId = currentDraft?.shareId;

      if (pendingShareId === undefined) {
        throw new Error("Expected an Android Share Intent to be pending.");
      }

      await adapter.completeShare({ message: "Item sent" });

      if (currentDraft?.shareId === pendingShareId) {
        publish(null);
      }
    },
  };
}

function parseShareDraft(payload: unknown): ShareDraft | null {
  const result = sharePayloadSchema.safeParse(payload);

  if (!result.success) {
    console.error("Received an invalid Android share payload.", result.error);
    return null;
  }

  return {
    shareId: result.data.shareId,
    itemType: isValidAbsoluteUrl(result.data.text) ? "url" : "text",
    title: result.data.title ?? "",
    value: result.data.text,
  };
}
