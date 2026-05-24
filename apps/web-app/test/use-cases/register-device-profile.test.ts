import { expect, test } from "vitest";

import { validateRegisterDeviceProfileInput } from "#pkg/use-cases/register-device-profile.ts";

test("validateRegisterDeviceProfileInput trims setup values", () => {
  expect(
    validateRegisterDeviceProfileInput({
      deviceNickname: "  Patrick's Android  ",
      relayHubBaseUrl: " https://relay.example.com/ ",
    }),
  ).toEqual({
    deviceNickname: "Patrick's Android",
    relayHubBaseUrl: "https://relay.example.com",
  });
});

test("validateRegisterDeviceProfileInput rejects missing Relay Hub URLs", () => {
  expect(() =>
    validateRegisterDeviceProfileInput({
      deviceNickname: "Patrick's Android",
      relayHubBaseUrl: "   ",
    }),
  ).toThrowError("Enter the Relay Hub URL.");
});

test("validateRegisterDeviceProfileInput rejects missing device nicknames", () => {
  expect(() =>
    validateRegisterDeviceProfileInput({
      deviceNickname: "   ",
      relayHubBaseUrl: "https://relay.example.com",
    }),
  ).toThrowError("Enter this device nickname.");
});
