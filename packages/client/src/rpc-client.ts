import type { DevicePlatform, DeliveryListState, PushRegistration } from "@content-relay/shared";

import {
  createAuthenticatedHttpClient,
  createHttpClient,
  type CreateAuthenticatedHttpClientOptions,
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

  async listDevices(opts: CreateAuthenticatedHttpClientOptions) {
    return createAuthenticatedHttpClient(opts).devices.$get();
  },

  async renameDevice(opts: CreateAuthenticatedHttpClientOptions, nickname: string) {
    return createAuthenticatedHttpClient(opts).devices[":deviceId"].$patch({
      param: { deviceId: opts.deviceId },
      json: { nickname },
    });
  },

  async deleteDevice(opts: CreateAuthenticatedHttpClientOptions) {
    return createAuthenticatedHttpClient(opts).devices[":deviceId"].$delete({
      param: { deviceId: opts.deviceId },
    });
  },

  async setPushToken(opts: CreateAuthenticatedHttpClientOptions, token: string) {
    return createAuthenticatedHttpClient(opts).devices[":deviceId"]["push-token"].$post({
      param: { deviceId: opts.deviceId },
      json: { token },
    });
  },

  async sendText(
    opts: CreateAuthenticatedHttpClientOptions,
    input: { text: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createAuthenticatedHttpClient(opts).items.text.$post({ json: input });
  },

  async sendUrl(
    opts: CreateAuthenticatedHttpClientOptions,
    input: { url: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createAuthenticatedHttpClient(opts).items.url.$post({ json: input });
  },

  async sendFiles(
    opts: CreateAuthenticatedHttpClientOptions,
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

    return createAuthenticatedHttpClient(opts).items.file.$post({
      form: {
        targetDeviceIds: JSON.stringify(request.targetDeviceIds),
        ...(request.title !== undefined ? { title: request.title } : {}),
        files,
      },
    });
  },

  async fetchPendingDeliveries(opts: CreateAuthenticatedHttpClientOptions) {
    return createAuthenticatedHttpClient(opts).deliveries.pending.$get();
  },

  async acknowledgeDelivery(opts: CreateAuthenticatedHttpClientOptions, deliveryId: string) {
    return createAuthenticatedHttpClient(opts).deliveries[":deliveryId"].ack.$post({
      param: { deliveryId },
    });
  },

  async markDeliveryViewed(opts: CreateAuthenticatedHttpClientOptions, deliveryId: string) {
    return createAuthenticatedHttpClient(opts).deliveries[":deliveryId"].viewed.$post({
      param: { deliveryId },
    });
  },

  async listDeliveries(
    opts: CreateAuthenticatedHttpClientOptions,
    input: { state?: DeliveryListState; limit?: number | string } = {},
  ) {
    return createAuthenticatedHttpClient(opts).deliveries.$get({
      query: {
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getDelivery(opts: CreateAuthenticatedHttpClientOptions, deliveryId: string) {
    return createAuthenticatedHttpClient(opts).deliveries[":deliveryId"].$get({
      param: { deliveryId },
    });
  },

  async listItems(
    opts: CreateAuthenticatedHttpClientOptions,
    input: { limit?: number | string } = {},
  ) {
    return createAuthenticatedHttpClient(opts).items.$get({
      query: {
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getItem(opts: CreateAuthenticatedHttpClientOptions, itemId: string) {
    return createAuthenticatedHttpClient(opts).items[":itemId"].$get({
      param: { itemId },
    });
  },

  async downloadDelivery(opts: CreateAuthenticatedHttpClientOptions, deliveryId: string) {
    return createAuthenticatedHttpClient(opts).deliveries[":deliveryId"].download.$get({
      param: { deliveryId },
    });
  },
};
