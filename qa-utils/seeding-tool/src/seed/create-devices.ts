import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DevicePlatform } from "@content-relay/contracts";

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
  const inviteDevice = await parseOkResponse(
    new RpcClient(relayHubBaseUrl).createInvite({ expiresInSeconds: 60 }),
  );
  const registerResult = await parseOkResponse(
    new RpcClient(relayHubBaseUrl).registerDevice({
      nickname: input.nickname,
      platform: input.platform,
      invite: inviteDevice.inviteCode,
      ...(input.platform === "ios" || input.platform === "android"
        ? { pushRegistration: { token: `test-${input.platform}-${input.nickname}` } }
        : {}),
    }),
  );

  return registerResult;
}
