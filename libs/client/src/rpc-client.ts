import type {
  AuthHeaders,
  DevicePlatform,
  DeliveryListState,
  PushRegistration,
  DeviceId,
} from "@content-relay/contracts";

import { createHonoClient, type HonoClient } from "#pkg/hono-client.ts";

export class RpcClient {
  #honoClient: HonoClient;

  constructor(relayHubBaseUrl: string) {
    this.#honoClient = createHonoClient({ relayHubBaseUrl });
  }

  async registerDevice(params: {
    nickname: string;
    platform: DevicePlatform;
    pushRegistration?: PushRegistration;
  }) {
    return this.#honoClient.devices.register.$post({ json: params });
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

  async listDevices() {
    return this.#honoClient.devices.$get({ header: createAuthHeaders(this.#deviceId) });
  }

  async renameDevice(params: { deviceId?: string; nickname: string }) {
    return this.#honoClient.devices[":deviceId"].$patch({
      header: createAuthHeaders(this.#deviceId),
      param: { deviceId: params.deviceId ?? this.#deviceId },
      json: { nickname: params.nickname },
    });
  }

  async deleteDevice(params: { deviceId?: string } = {}) {
    return this.#honoClient.devices[":deviceId"].$delete({
      header: createAuthHeaders(this.#deviceId),
      param: { deviceId: params.deviceId ?? this.#deviceId },
    });
  }

  async setPushToken(params: { deviceId?: string; token: string }) {
    return this.#honoClient.devices[":deviceId"]["push-token"].$post({
      header: createAuthHeaders(this.#deviceId),
      param: { deviceId: params.deviceId ?? this.#deviceId },
      json: { token: params.token },
    });
  }

  async sendText(params: { text: string; targetDeviceIds: string[]; title?: string }) {
    return this.#honoClient.items.text.$post({
      header: createAuthHeaders(this.#deviceId),
      json: params,
    });
  }

  async sendUrl(params: { url: string; targetDeviceIds: string[]; title?: string }) {
    return this.#honoClient.items.url.$post({
      header: createAuthHeaders(this.#deviceId),
      json: params,
    });
  }

  async sendFiles(params: {
    targetDeviceIds: string[];
    title?: string;
    files: { content: Uint8Array<ArrayBuffer>; basename: string }[];
  }) {
    const files = await Promise.all(
      params.files.map(async (file) => {
        return new File([file.content], file.basename);
      }),
    );

    return this.#honoClient.items.file.$post({
      header: createAuthHeaders(this.#deviceId),
      form: {
        targetDeviceIds: JSON.stringify(params.targetDeviceIds),
        ...(params.title !== undefined ? { title: params.title } : {}),
        files,
      },
    });
  }

  async fetchPendingDeliveries() {
    return this.#honoClient.deliveries.pending.$get({ header: createAuthHeaders(this.#deviceId) });
  }

  async acknowledgeDelivery(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].ack.$post({
      header: createAuthHeaders(this.#deviceId),
      param: { deliveryId: params.deliveryId },
    });
  }

  async markDeliveryViewed(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].viewed.$post({
      header: createAuthHeaders(this.#deviceId),
      param: { deliveryId: params.deliveryId },
    });
  }

  async listDeliveries(params: { state?: DeliveryListState; limit?: number | string } = {}) {
    return this.#honoClient.deliveries.$get({
      header: createAuthHeaders(this.#deviceId),
      query: {
        ...(params.state !== undefined ? { state: params.state } : {}),
        ...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
      },
    });
  }

  async getDelivery(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].$get({
      header: createAuthHeaders(this.#deviceId),
      param: { deliveryId: params.deliveryId },
    });
  }

  async listItems(params: { limit?: number | string } = {}) {
    return this.#honoClient.items.$get({
      header: createAuthHeaders(this.#deviceId),
      query: {
        ...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
      },
    });
  }

  async getItem(params: { itemId: string }) {
    return this.#honoClient.items[":itemId"].$get({
      header: createAuthHeaders(this.#deviceId),
      param: { itemId: params.itemId },
    });
  }

  async downloadDelivery(params: { deliveryId: string }) {
    return this.#honoClient.deliveries[":deliveryId"].download.$get({
      header: createAuthHeaders(this.#deviceId),
      param: { deliveryId: params.deliveryId },
    });
  }
}

function createAuthHeaders(deviceId: DeviceId): AuthHeaders {
  return {
    "x-relay-device-id": deviceId,
  } as const satisfies AuthHeaders;
}
