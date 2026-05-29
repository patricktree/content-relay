import { useQuery } from "@tanstack/react-query";

import { parseOkResponse, RpcClient } from "@content-relay/client";

type UseRegisteredDeviceQueryOpts = {
  relayHubUrl: string;
  deviceNickname: string;
};

export function useRegisteredDeviceQuery(opts: UseRegisteredDeviceQueryOpts) {
  return useQuery({
    queryFn: async () => {
      return parseOkResponse(
        new RpcClient(opts.relayHubUrl).registerDevice({
          nickname: opts.deviceNickname,
          platform: "generic",
        }),
      );
    },
    queryKey: ["registered-device", opts.relayHubUrl, opts.deviceNickname],
  });
}
