import { parseOkResponse, RpcClient } from "@content-relay/client";

type RegisteredDeviceQueryOpts = {
  relayHubUrl: string;
  deviceNickname: string;
};

export function createRegisteredDeviceQuery(opts: RegisteredDeviceQueryOpts) {
  return {
    queryFn: async () => {
      return parseOkResponse(
        new RpcClient(opts.relayHubUrl).registerDevice({
          nickname: opts.deviceNickname,
          platform: "generic",
        }),
      );
    },
    queryKey: ["registered-device", opts.relayHubUrl, opts.deviceNickname],
  };
}
