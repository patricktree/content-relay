import { parseOkResponse, RpcClient } from "@content-relay/client";

type CreateAvailableDevicesQueryOpts = {
  relayHubUrl: string;
};

export function createAvailableDevicesQuery(opts: CreateAvailableDevicesQueryOpts) {
  const query = {
    queryFn: async () => {
      return parseOkResponse(new RpcClient(opts.relayHubUrl).listDevices());
    },
    queryKey: ["available-devices", opts.relayHubUrl],
  };

  return query;
}
