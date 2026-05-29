import { useQuery } from "@tanstack/react-query";

import { parseOkResponse, RpcClient } from "@content-relay/client";

type UseAvailableDevicesQueryOpts = {
  relayHubUrl: string;
  deviceId: string;
};

export function useAvailableDevicesQuery(opts: UseAvailableDevicesQueryOpts) {
  const query = useQuery({
    queryFn: async () => {
      return parseOkResponse(new RpcClient(opts.relayHubUrl).listDevices());
    },
    queryKey: ["available-devices", opts.relayHubUrl, opts.deviceId],
  });

  return query;
}
