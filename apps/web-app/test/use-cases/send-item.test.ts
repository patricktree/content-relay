import { expect, test } from "vitest";

import { validateSendItemInput } from "#pkg/use-cases/send-item.ts";

test("validateSendItemInput trims text send requests", () => {
  expect(
    validateSendItemInput({
      itemType: "text",
      profile: {
        deviceId: " sender ",
        relayHubBaseUrl: " https://relay.example.com/ ",
      },
      targetDeviceIds: ["phone", " phone ", "tablet"],
      title: "  Greeting  ",
      value: "  hello  ",
    }),
  ).toEqual({
    itemType: "text",
    profile: {
      deviceId: "sender",
      relayHubBaseUrl: "https://relay.example.com",
    },
    targetDeviceIds: ["phone", "tablet"],
    title: "Greeting",
    value: "hello",
  });
});

test("validateSendItemInput omits empty titles", () => {
  expect(
    validateSendItemInput({
      itemType: "url",
      profile: {
        deviceId: "sender",
        relayHubBaseUrl: "https://relay.example.com",
      },
      targetDeviceIds: ["phone"],
      title: "   ",
      value: " https://example.com/article ",
    }),
  ).toEqual({
    itemType: "url",
    profile: {
      deviceId: "sender",
      relayHubBaseUrl: "https://relay.example.com",
    },
    targetDeviceIds: ["phone"],
    value: "https://example.com/article",
  });
});

test("validateSendItemInput rejects missing target devices", () => {
  expect(() =>
    validateSendItemInput({
      itemType: "text",
      profile: {
        deviceId: "sender",
        relayHubBaseUrl: "https://relay.example.com",
      },
      targetDeviceIds: ["   "],
      title: "",
      value: "hello",
    }),
  ).toThrowError("Choose at least one target device.");
});

test("validateSendItemInput rejects invalid URLs", () => {
  expect(() =>
    validateSendItemInput({
      itemType: "url",
      profile: {
        deviceId: "sender",
        relayHubBaseUrl: "https://relay.example.com",
      },
      targetDeviceIds: ["phone"],
      title: "",
      value: "not a url",
    }),
  ).toThrowError("Enter a valid absolute URL.");
});
