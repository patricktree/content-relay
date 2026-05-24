import { useQuery } from "@tanstack/react-query";

import { parseOkResponse, rpcClient } from "@content-relay/client";

type UseAvailableDevicesOpts = {
  relayHubUrl: string;
  deviceId: string;
};

export function useAvailableDevices(opts: UseAvailableDevicesOpts) {
  const query = useQuery({
    queryFn: async () => {
      return parseOkResponse(
        rpcClient.listDevices({
          relayHubBaseUrl: opts.relayHubUrl,
          deviceId: opts.deviceId,
        }),
      );
    },
    queryKey: ["available-devices", opts.relayHubUrl, opts.deviceId],
  });

  return query;
}
