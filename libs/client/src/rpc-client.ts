import type { DevicePlatform, DeliveryListState, PushRegistration } from "@content-relay/shared";

import {
  createDeviceHttpClient,
  createHttpClient,
  type CreateDeviceHttpClientOptions,
} from "#pkg/http-client.ts";

export const rpcClient = {
  async createInvite(serverBaseUrl: string, input: { expiresInSeconds: number }) {
    return createHttpClient({ serverBaseUrl }).invites.$post({ json: input });
  },

  async registerDevice(
    serverBaseUrl: string,
    input: {
      nickname: string;
      platform: DevicePlatform;
      invite: string;
      pushRegistration?: PushRegistration;
    },
  ) {
    return createHttpClient({ serverBaseUrl }).devices.register.$post({ json: input });
  },

  async listDevices(opts: CreateDeviceHttpClientOptions) {
    return createDeviceHttpClient(opts).devices.$get();
  },

  async renameDevice(opts: CreateDeviceHttpClientOptions, nickname: string) {
    return createDeviceHttpClient(opts).devices[":deviceId"].$patch({
      param: { deviceId: opts.deviceId },
      json: { nickname },
    });
  },

  async deleteDevice(opts: CreateDeviceHttpClientOptions) {
    return createDeviceHttpClient(opts).devices[":deviceId"].$delete({
      param: { deviceId: opts.deviceId },
    });
  },

  async setPushToken(opts: CreateDeviceHttpClientOptions, token: string) {
    return createDeviceHttpClient(opts).devices[":deviceId"]["push-token"].$post({
      param: { deviceId: opts.deviceId },
      json: { token },
    });
  },

  async sendText(
    opts: CreateDeviceHttpClientOptions,
    input: { text: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createDeviceHttpClient(opts).items.text.$post({ json: input });
  },

  async sendUrl(
    opts: CreateDeviceHttpClientOptions,
    input: { url: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createDeviceHttpClient(opts).items.url.$post({ json: input });
  },

  async sendFiles(
    opts: CreateDeviceHttpClientOptions,
    request: {
      targetDeviceIds: string[];
      title?: string;
      files: { content: Uint8Array<ArrayBuffer>; basename: string }[];
    },
  ) {
    const files = await Promise.all(
      request.files.map(async (file) => {
        return new File([file.content], file.basename);
      }),
    );

    return createDeviceHttpClient(opts).items.file.$post({
      form: {
        targetDeviceIds: JSON.stringify(request.targetDeviceIds),
        ...(request.title !== undefined ? { title: request.title } : {}),
        files,
      },
    });
  },

  async fetchPendingDeliveries(opts: CreateDeviceHttpClientOptions) {
    return createDeviceHttpClient(opts).deliveries.pending.$get();
  },

  async acknowledgeDelivery(opts: CreateDeviceHttpClientOptions, deliveryId: string) {
    return createDeviceHttpClient(opts).deliveries[":deliveryId"].ack.$post({
      param: { deliveryId },
    });
  },

  async markDeliveryViewed(opts: CreateDeviceHttpClientOptions, deliveryId: string) {
    return createDeviceHttpClient(opts).deliveries[":deliveryId"].viewed.$post({
      param: { deliveryId },
    });
  },

  async listDeliveries(
    opts: CreateDeviceHttpClientOptions,
    input: { state?: DeliveryListState; limit?: number | string } = {},
  ) {
    return createDeviceHttpClient(opts).deliveries.$get({
      query: {
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getDelivery(opts: CreateDeviceHttpClientOptions, deliveryId: string) {
    return createDeviceHttpClient(opts).deliveries[":deliveryId"].$get({
      param: { deliveryId },
    });
  },

  async listItems(opts: CreateDeviceHttpClientOptions, input: { limit?: number | string } = {}) {
    return createDeviceHttpClient(opts).items.$get({
      query: {
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getItem(opts: CreateDeviceHttpClientOptions, itemId: string) {
    return createDeviceHttpClient(opts).items[":itemId"].$get({
      param: { itemId },
    });
  },

  async downloadDelivery(opts: CreateDeviceHttpClientOptions, deliveryId: string) {
    return createDeviceHttpClient(opts).deliveries[":deliveryId"].download.$get({
      param: { deliveryId },
    });
  },
};
