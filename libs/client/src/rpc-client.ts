import type {
  CreateTextItemRequest,
  CreateUrlItemRequest,
  DeviceId,
  DeliveryListState,
  PushTokenRequest,
  RegisterDeviceRequest,
  UpdateDeviceRequest,
} from "@content-relay/contracts";

import { createHonoClient, type HonoClient } from "#src/hono-client.ts";

export class RpcClient {
  #honoClient: HonoClient;

  constructor(relayHubBaseUrl: string) {
    this.#honoClient = createHonoClient({ relayHubBaseUrl });
  }

  async registerDevice(params: RegisterDeviceRequest) {
    return this.#honoClient.devices.register.$post({ json: params });
  }

  async listDevices() {
    return this.#honoClient.devices.$get();
  }

  createDeviceRpcClient(deviceId: DeviceId): DeviceRpcClient {
    return new DeviceRpcClient(this.#honoClient, deviceId);
  }
}

class DeviceRpcClient {
  #honoClient: HonoClient;
  #deviceId: DeviceId;

  constructor(honoClient: HonoClient, deviceId: DeviceId) {
    this.#honoClient = honoClient;
    this.#deviceId = deviceId;
  }

  async renameDevice(params: UpdateDeviceRequest & { deviceId?: DeviceId }) {
    return this.#honoClient.devices[":deviceId"].$patch({
      param: { deviceId: params.deviceId ?? this.#deviceId },
      json: { nickname: params.nickname },
    });
  }

  async deleteDevice(params: { deviceId?: DeviceId } = {}) {
    return this.#honoClient.devices[":deviceId"].$delete({
      param: { deviceId: params.deviceId ?? this.#deviceId },
    });
  }

  async setPushToken(params: PushTokenRequest & { deviceId?: DeviceId }) {
    return this.#honoClient.devices[":deviceId"]["push-token"].$post({
      param: { deviceId: params.deviceId ?? this.#deviceId },
      json: { token: params.token },
    });
  }

  async sendText(params: Omit<CreateTextItemRequest, "sourceDeviceId">) {
    return this.#honoClient.items.text.$post({
      json: { sourceDeviceId: this.#deviceId, ...params },
    });
  }

  async sendUrl(params: Omit<CreateUrlItemRequest, "sourceDeviceId">) {
    return this.#honoClient.items.url.$post({
      json: { sourceDeviceId: this.#deviceId, ...params },
    });
  }

  async sendFiles(params: {
    targetDeviceIds: DeviceId[];
    title?: string;
    files: { content: Uint8Array<ArrayBuffer>; basename: string }[];
  }) {
    const files = await Promise.all(
      params.files.map(async (file) => {
        return new File([file.content], file.basename);
      }),
    );

    return this.#honoClient.items.file.$post({
      form: {
        sourceDeviceId: this.#deviceId,
        targetDeviceIds: JSON.stringify(params.targetDeviceIds),
        ...(params.title !== undefined ? { title: params.title } : {}),
        files,
      },
    });
  }

  async acknowledgeDelivery(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].ack.$post({
      param: { deliveryId: params.deliveryId },
      query: { targetDeviceId: this.#deviceId },
    });
  }

  async markDeliveryViewed(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].viewed.$post({
      param: { deliveryId: params.deliveryId },
      query: { targetDeviceId: this.#deviceId },
    });
  }

  async listDeliveries(
    params: { state?: DeliveryListState; limit?: number | string; cursor?: string } = {},
  ) {
    return this.#honoClient.deliveries.$get({
      query: {
        targetDeviceId: this.#deviceId,
        ...(params.state !== undefined ? { state: params.state } : {}),
        ...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
      },
    });
  }

  async getDelivery(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].$get({
      param: { deliveryId: params.deliveryId },
      query: { targetDeviceId: this.#deviceId },
    });
  }

  async listItems(params: { limit?: number | string } = {}) {
    return this.#honoClient.items.$get({
      query: {
        sourceDeviceId: this.#deviceId,
        ...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
      },
    });
  }

  async getItem(params: { itemId: string }) {
    return this.#honoClient.items[":itemId"].$get({
      param: { itemId: params.itemId },
      query: { sourceDeviceId: this.#deviceId },
    });
  }

  async downloadDelivery(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].download.$get({
      param: { deliveryId: params.deliveryId },
      query: { targetDeviceId: this.#deviceId },
    });
  }
}
