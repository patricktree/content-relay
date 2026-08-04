import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";

import { withRelayHubTestEnvironment } from "@content-relay/relay-hub-test-utils";
import { seed } from "@content-relay/seeding-tool";

import { createCurrentDeviceQuery } from "#src/data-fetching/current-device.js";

test("registers the current Device and discovers eligible target Devices", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const [seededTargetDevice] = await seed.registerDevices(relayHubBaseUrl, [
      { nickname: "Target Device", platform: "cli" },
    ]);
    const targetDevice = expectDevice(seededTargetDevice);

    const queryClient = createQueryClient();
    const setup = await queryClient.fetchQuery(
      createCurrentDeviceQuery({
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "Current Browser",
      }),
    );

    expect(setup.currentDevice).toMatchObject({
      nickname: "Current Browser",
      platform: "generic",
      relayHubBaseUrl,
    });
    expect(setup.eligibleTargetDevices).toEqual([
      expect.objectContaining({
        deviceId: targetDevice.deviceId,
        nickname: "Target Device",
        platform: "cli",
      }),
    ]);
    expect(setup.eligibleTargetDevices).not.toContainEqual(
      expect.objectContaining({ deviceId: setup.currentDevice.deviceId }),
    );
    expect(setup.deviceNicknamesById).toMatchObject({
      [setup.currentDevice.deviceId]: "Current Browser",
      [targetDevice.deviceId]: "Target Device",
    });
  });
});

test("creates a new current Device setup when settings change", async () => {
  await withRelayHubTestEnvironment(async ({ relayHubBaseUrl }) => {
    const queryClient = createQueryClient();
    const oldSetup = await queryClient.fetchQuery(
      createCurrentDeviceQuery({
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "Old Browser",
      }),
    );
    const newSetup = await queryClient.fetchQuery(
      createCurrentDeviceQuery({
        relayHubUrl: relayHubBaseUrl,
        deviceNickname: "New Browser",
      }),
    );

    expect(newSetup.currentDevice.deviceId).not.toBe(oldSetup.currentDevice.deviceId);
    expect(newSetup.currentDevice.nickname).toBe("New Browser");
    expect(newSetup.eligibleTargetDevices).toContainEqual(
      expect.objectContaining({
        deviceId: oldSetup.currentDevice.deviceId,
        nickname: "Old Browser",
      }),
    );
    expect(newSetup.eligibleTargetDevices).not.toContainEqual(
      expect.objectContaining({ deviceId: newSetup.currentDevice.deviceId }),
    );
  });
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

type SeededDevice = Awaited<ReturnType<typeof seed.registerDevices>>[number];

function expectDevice(device: SeededDevice | undefined): NonNullable<SeededDevice> {
  if (device === null || device === undefined) {
    throw new Error("Expected the Device to be registered.");
  }

  return device;
}
