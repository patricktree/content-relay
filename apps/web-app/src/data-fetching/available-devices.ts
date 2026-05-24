import { useQuery } from "@tanstack/react-query";

import { parseOkResponse, RpcClient } from "@content-relay/client";

type UseAvailableDevicesOpts = {
  relayHubUrl: string;
  deviceId: string;
};

export function useAvailableDevices(opts: UseAvailableDevicesOpts) {
  const query = useQuery({
    queryFn: async () => {
      return parseOkResponse(
        new RpcClient(opts.relayHubUrl).createDeviceRpcClient(opts.deviceId).listDevices(),
      );
    },
    queryKey: ["available-devices", opts.relayHubUrl, opts.deviceId],
  });

  return query;
}
