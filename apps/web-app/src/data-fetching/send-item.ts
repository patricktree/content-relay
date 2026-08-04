import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { DeviceId } from "@content-relay/contracts";

import { createSendItem, type SendItem } from "#src/application/send-item.js";

type CreateRelayHubItemSenderOptions = {
  relayHubUrl: string;
  sourceDeviceId: DeviceId;
  completePendingAndroidShare?: () => Promise<void>;
};

export function createRelayHubItemSender({
  relayHubUrl,
  sourceDeviceId,
  completePendingAndroidShare,
}: CreateRelayHubItemSenderOptions): SendItem {
  const deviceRpcClient = new RpcClient(relayHubUrl).createDeviceRpcClient(sourceDeviceId);

  return createSendItem({
    sendText: async (request) => {
      await parseOkResponse(deviceRpcClient.sendText(request));
    },
    sendUrl: async (request) => {
      await parseOkResponse(deviceRpcClient.sendUrl(request));
    },
    ...(completePendingAndroidShare === undefined ? {} : { completePendingAndroidShare }),
  });
}
