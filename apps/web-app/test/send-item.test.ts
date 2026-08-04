import { expect, test } from "vitest";

import { createSendItem, type SendItemInput } from "#src/application/send-item.js";

const defaultInput: SendItemInput = {
  itemType: "text",
  targetDeviceIds: new Set(["target-device"]),
  title: "",
  value: "Item content",
};

test("normalizes a text Item before sending it to the Relay Hub", async () => {
  const sentTextRequests: unknown[] = [];
  const sentUrlRequests: unknown[] = [];
  const sendItem = createSendItem({
    sendText: async (request) => {
      sentTextRequests.push(request);
    },
    sendUrl: async (request) => {
      sentUrlRequests.push(request);
    },
  });

  await sendItem({
    ...defaultInput,
    targetDeviceIds: new Set(["first-device", "second-device"]),
    title: "   ",
    value: "  Item content  ",
  });

  expect(sentTextRequests).toEqual([
    {
      targetDeviceIds: ["first-device", "second-device"],
      text: "Item content",
    },
  ]);
  expect(sentUrlRequests).toEqual([]);
});

test("dispatches a normalized URL Item to the URL adapter", async () => {
  const sentTextRequests: unknown[] = [];
  const sentUrlRequests: unknown[] = [];
  const sendItem = createSendItem({
    sendText: async (request) => {
      sentTextRequests.push(request);
    },
    sendUrl: async (request) => {
      sentUrlRequests.push(request);
    },
  });

  await sendItem({
    ...defaultInput,
    itemType: "url",
    title: "  Article title  ",
    value: "  https://example.com/article  ",
  });

  expect(sentUrlRequests).toEqual([
    {
      targetDeviceIds: ["target-device"],
      title: "Article title",
      url: "https://example.com/article",
    },
  ]);
  expect(sentTextRequests).toEqual([]);
});

test("rejects an invalid Item before dispatch", async () => {
  const dispatchedRequests: unknown[] = [];
  const sendItem = createSendItem({
    sendText: async (request) => {
      dispatchedRequests.push(request);
    },
    sendUrl: async (request) => {
      dispatchedRequests.push(request);
    },
  });

  await expect(sendItem({ ...defaultInput, value: "   " })).rejects.toThrow(
    "Enter the text to send.",
  );
  expect(dispatchedRequests).toEqual([]);
});

test("completes a pending Android share only after the Relay Hub send succeeds", async () => {
  const events: string[] = [];
  const relayHubSend = createDeferred<void>();
  const sendItem = createSendItem({
    sendText: async () => {
      events.push("Relay Hub send started");
      await relayHubSend.promise;
      events.push("Relay Hub send completed");
    },
    sendUrl: async () => {},
    completePendingAndroidShare: async () => {
      events.push("Android share completed");
    },
  });

  const sendPromise = sendItem(defaultInput);
  await Promise.resolve();

  expect(events).toEqual(["Relay Hub send started"]);

  relayHubSend.resolve();
  await sendPromise;

  expect(events).toEqual([
    "Relay Hub send started",
    "Relay Hub send completed",
    "Android share completed",
  ]);
});

test("does not complete a pending Android share when the Relay Hub send fails", async () => {
  const relayHubError = new Error("Relay Hub unavailable");
  let completedAndroidShare = false;
  const sendItem = createSendItem({
    sendText: async () => {
      throw relayHubError;
    },
    sendUrl: async () => {},
    completePendingAndroidShare: async () => {
      completedAndroidShare = true;
    },
  });

  await expect(sendItem(defaultInput)).rejects.toBe(relayHubError);
  expect(completedAndroidShare).toBe(false);
});

test("reports Android share completion failure after the Item was sent", async () => {
  const shareCompletionError = new Error("Android share completion failed");
  let sentItem = false;
  const sendItem = createSendItem({
    sendText: async () => {
      sentItem = true;
    },
    sendUrl: async () => {},
    completePendingAndroidShare: async () => {
      throw shareCompletionError;
    },
  });

  await expect(sendItem(defaultInput)).rejects.toBe(shareCompletionError);
  expect(sentItem).toBe(true);
});

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
