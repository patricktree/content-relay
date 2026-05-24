import type { DevicePlatform } from "@content-relay/contracts";

export type ActiveDeviceContext = {
  relayHubBaseUrl: string;
  deviceId: string;
};

export type ActiveDeviceWithPlatform = ActiveDeviceContext & {
  platform: DevicePlatform;
};
