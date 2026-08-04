import { queryOptions } from "@tanstack/react-query";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeviceSummary, RegisterDeviceResponse } from "@content-relay/contracts";

type CurrentDeviceQueryOptions = {
  relayHubUrl: string;
  deviceNickname: string;
};

type CurrentDeviceSetup = {
  currentDevice: RegisterDeviceResponse;
  eligibleTargetDevices: DeviceSummary[];
  deviceNicknamesById: Record<string, string>;
};

export function createCurrentDeviceQuery(options: CurrentDeviceQueryOptions) {
  return queryOptions({
    queryFn: async (): Promise<CurrentDeviceSetup> => {
      const relayHub = new RpcClient(options.relayHubUrl);
      const currentDevice = await parseOkResponse(
        relayHub.registerDevice({
          nickname: options.deviceNickname,
          platform: "generic",
        }),
      );
      const devices = await parseOkResponse(relayHub.listDevices());

      return {
        currentDevice,
        eligibleTargetDevices: devices.filter(
          (device) => device.deviceId !== currentDevice.deviceId,
        ),
        deviceNicknamesById: Object.fromEntries(
          devices.map((device) => [device.deviceId, device.nickname]),
        ),
      };
    },
    queryKey: ["current-device", options.relayHubUrl, options.deviceNickname],
  });
}
