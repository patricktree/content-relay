import { afterEach, expect, test, vi } from "vitest";

import {
  createAndroidShareIntake,
  type AndroidShareAdapter,
  type ShareDraft,
} from "#src/application/android-share-intake.js";

const firstShare = {
  shareId: "00000000-0000-4000-8000-000000000001",
  text: "  https://example.com/article  ",
  title: "  Article title  ",
};

const secondShare = {
  shareId: "00000000-0000-4000-8000-000000000002",
  text: "Second Item",
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("maps the initial pending Android Share Intent into a Share Draft", async () => {
  const adapter = createTestAdapter({ pendingResponse: { share: firstShare } });
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];

  const unsubscribe = await intake.subscribe((draft) => drafts.push(draft));

  expect(drafts).toEqual([
    {
      shareId: firstShare.shareId,
      itemType: "url",
      title: "Article title",
      value: "https://example.com/article",
    },
  ]);

  await unsubscribe();
});

test("ignores invalid initial and subsequent Android share payloads", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const adapter = createTestAdapter({ pendingResponse: { share: { text: "missing ID" } } });
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];

  const unsubscribe = await intake.subscribe((draft) => drafts.push(draft));
  adapter.emit({ shareId: "not-a-uuid", text: "invalid" });

  expect(drafts).toEqual([null]);
  await expect(intake.complete()).rejects.toThrow(
    "Expected an Android Share Intent to be pending.",
  );

  await unsubscribe();
});

test("stays inactive when Android sharing is unavailable", async () => {
  const adapter = createTestAdapter();
  const consumePendingShare = vi.fn<AndroidShareAdapter["consumePendingShare"]>();
  const addShareListener = vi.fn<AndroidShareAdapter["addShareListener"]>();
  adapter.isAvailable = () => false;
  adapter.consumePendingShare = consumePendingShare;
  adapter.addShareListener = addShareListener;
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];

  const unsubscribe = await intake.subscribe((draft) => drafts.push(draft));

  expect(drafts).toEqual([null]);
  expect(consumePendingShare).not.toHaveBeenCalled();
  expect(addShareListener).not.toHaveBeenCalled();

  await unsubscribe();
});

test("publishes each subsequent Share Intent and retains only the latest one", async () => {
  const adapter = createTestAdapter();
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];
  const unsubscribe = await intake.subscribe((draft) => drafts.push(draft));

  adapter.emit(firstShare);
  adapter.emit(secondShare);
  await intake.complete();

  expect(drafts).toEqual([
    null,
    {
      shareId: firstShare.shareId,
      itemType: "url",
      title: "Article title",
      value: "https://example.com/article",
    },
    {
      shareId: secondShare.shareId,
      itemType: "text",
      title: "",
      value: "Second Item",
    },
    null,
  ]);
  expect(adapter.completedShares).toEqual([{ message: "Item sent" }]);

  await unsubscribe();
});

test("does not overwrite a newly received Share Intent with an older consumed value", async () => {
  const pendingResponse = createDeferred<unknown>();
  const adapter = createTestAdapter({ pendingResponse: pendingResponse.promise });
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];
  const subscription = intake.subscribe((draft) => drafts.push(draft));

  await vi.waitFor(() => expect(adapter.listenerCount).toBe(1));
  adapter.emit(secondShare);
  pendingResponse.resolve({ share: firstShare });
  const unsubscribe = await subscription;

  expect(drafts).toEqual([
    {
      shareId: secondShare.shareId,
      itemType: "text",
      title: "",
      value: "Second Item",
    },
  ]);

  await unsubscribe();
});

test("removes the native listener when the last subscriber leaves", async () => {
  const adapter = createTestAdapter();
  const intake = createAndroidShareIntake(adapter);
  const unsubscribeFirst = await intake.subscribe(() => {});
  const unsubscribeSecond = await intake.subscribe(() => {});

  await unsubscribeFirst();
  expect(adapter.removedListenerCount).toBe(0);

  await unsubscribeSecond();
  expect(adapter.removedListenerCount).toBe(1);
  expect(adapter.listenerCount).toBe(0);
});

test("removes the native listener when initial consumption fails", async () => {
  const consumptionError = new Error("Pending Android share could not be consumed");
  const adapter = createTestAdapter({ pendingResponse: Promise.reject(consumptionError) });
  const intake = createAndroidShareIntake(adapter);

  await expect(intake.subscribe(() => {})).rejects.toBe(consumptionError);
  expect(adapter.removedListenerCount).toBe(1);
  expect(adapter.listenerCount).toBe(0);
});

test("cancellation clears the pending Share Draft even when native cancellation fails", async () => {
  const cancellationError = new Error("Android overlay unavailable");
  const adapter = createTestAdapter({ pendingResponse: { share: firstShare } });
  adapter.cancelShare = async () => {
    throw cancellationError;
  };
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];
  const unsubscribe = await intake.subscribe((draft) => drafts.push(draft));

  await expect(intake.cancel()).rejects.toBe(cancellationError);
  expect(drafts[drafts.length - 1]).toBeNull();

  await unsubscribe();
});

test("completion preserves the pending Share Draft when native completion fails", async () => {
  const completionError = new Error("Android completion failed");
  const adapter = createTestAdapter({ pendingResponse: { share: firstShare } });
  adapter.completeShare = async () => {
    throw completionError;
  };
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];
  const unsubscribe = await intake.subscribe((draft) => drafts.push(draft));

  await expect(intake.complete()).rejects.toBe(completionError);
  expect(drafts[drafts.length - 1]?.shareId).toBe(firstShare.shareId);

  await unsubscribe();
});

test("keeps a newer Share Intent when cancellation of the previous one settles", async () => {
  const cancellation = createDeferred<void>();
  const adapter = createTestAdapter({ pendingResponse: { share: firstShare } });
  adapter.cancelShare = () => cancellation.promise;
  const intake = createAndroidShareIntake(adapter);
  const drafts: Array<ShareDraft | null> = [];
  const unsubscribe = await intake.subscribe((draft) => drafts.push(draft));

  const cancelPromise = intake.cancel();
  adapter.emit(secondShare);
  cancellation.resolve();
  await cancelPromise;

  expect(drafts[drafts.length - 1]?.shareId).toBe(secondShare.shareId);

  await unsubscribe();
});

type TestAdapter = AndroidShareAdapter & {
  emit(payload: unknown): void;
  readonly completedShares: Array<{ message: string }>;
  readonly listenerCount: number;
  readonly removedListenerCount: number;
};

function createTestAdapter(options?: { pendingResponse?: unknown }): TestAdapter {
  const listeners = new Set<(payload: unknown) => void>();
  const completedShares: Array<{ message: string }> = [];
  let removedListenerCount = 0;

  return {
    isAvailable: () => true,
    consumePendingShare: async () => options?.pendingResponse ?? { share: null },
    addShareListener: async (listener) => {
      listeners.add(listener);
      return async () => {
        if (listeners.delete(listener)) {
          removedListenerCount += 1;
        }
      };
    },
    cancelShare: async () => {},
    completeShare: async (input) => {
      completedShares.push(input);
    },
    emit(payload) {
      for (const listener of listeners) {
        listener(payload);
      }
    },
    completedShares,
    get listenerCount() {
      return listeners.size;
    },
    get removedListenerCount() {
      return removedListenerCount;
    },
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  if (resolve === undefined) {
    throw new Error("Expected deferred resolve callback to be initialized.");
  }

  return { promise, resolve };
}
