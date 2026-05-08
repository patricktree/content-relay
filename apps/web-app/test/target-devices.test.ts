import { expect, test } from "vitest";

import type { DeviceSummary } from "@content-relay/shared";

import { getUnavailableSelectedTargetDeviceIds } from "#pkg/App.tsx";

const AVAILABLE_DEVICES = [createDeviceSummary("phone-1"), createDeviceSummary("tablet-1")];

test("getUnavailableSelectedTargetDeviceIds returns selected IDs missing from the refreshed device list", () => {
  expect(
    getUnavailableSelectedTargetDeviceIds(
      ["phone-1", "removed-device", "tablet-1", "removed-watch"],
      AVAILABLE_DEVICES,
    ),
  ).toEqual(["removed-device", "removed-watch"]);
});

test("getUnavailableSelectedTargetDeviceIds keeps all selected IDs when every selection is available", () => {
  expect(getUnavailableSelectedTargetDeviceIds(["phone-1", "tablet-1"], AVAILABLE_DEVICES)).toEqual(
    [],
  );
});

function createDeviceSummary(deviceId: string): DeviceSummary {
  return {
    createdAt: "2026-04-16T10:00:00.000Z",
    deviceId,
    nickname: deviceId,
    platform: "ios",
    updatedAt: "2026-04-16T10:00:00.000Z",
  };
}
