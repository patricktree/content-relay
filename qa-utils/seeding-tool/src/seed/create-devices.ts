import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DevicePlatform, PushRegistration } from "@content-relay/contracts";

export async function registerDevices(
  relayHubBaseUrl: string,
  devices: Array<{ nickname: string; platform: DevicePlatform }>,
) {
  const registerResults = await Promise.all(
    devices.map((device) => registerDevice(relayHubBaseUrl, device)),
  );

  return registerResults;
}

async function registerDevice(
  relayHubBaseUrl: string,
  input: { nickname: string; platform: DevicePlatform },
) {
  const pushRegistration = buildPushRegistration(input);

  return parseOkResponse(
    new RpcClient(relayHubBaseUrl).registerDevice({
      nickname: input.nickname,
      platform: input.platform,
      ...(pushRegistration === undefined ? {} : { pushRegistration }),
    }),
  );
}

function buildPushRegistration(input: {
  nickname: string;
  platform: DevicePlatform;
}): PushRegistration | undefined {
  if (input.platform !== "ios" && input.platform !== "android") {
    return undefined;
  }

  return {
    token: `test-${input.platform}-${input.nickname}`,
  };
}
