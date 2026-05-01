import type { DevicePlatform, DeliveryListState, PushRegistration } from "@content-relay/shared";

import {
  createAuthenticatedClient,
  createRelayHttpClient,
  type CreateAuthenticatedClientOptions,
} from "#pkg/http-client.ts";

export const rpcClient = {
  async createInvite(serverBaseUrl: string, input: { expiresInSeconds: number }) {
    return createRelayHttpClient({ serverBaseUrl }).invites.$post({ json: input });
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
    return createRelayHttpClient({ serverBaseUrl }).devices.register.$post({ json: input });
  },

  async listDevices(opts: CreateAuthenticatedClientOptions) {
    return createAuthenticatedClient(opts).devices.$get();
  },

  async renameDevice(opts: CreateAuthenticatedClientOptions, nickname: string) {
    return createAuthenticatedClient(opts).devices[":deviceId"].$patch({
      param: { deviceId: opts.deviceId },
      json: { nickname },
    });
  },

  async deleteDevice(opts: CreateAuthenticatedClientOptions) {
    return createAuthenticatedClient(opts).devices[":deviceId"].$delete({
      param: { deviceId: opts.deviceId },
    });
  },

  async setPushToken(opts: CreateAuthenticatedClientOptions, token: string) {
    return createAuthenticatedClient(opts).devices[":deviceId"]["push-token"].$post({
      param: { deviceId: opts.deviceId },
      json: { token },
    });
  },

  async sendText(
    opts: CreateAuthenticatedClientOptions,
    input: { text: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createAuthenticatedClient(opts).items.text.$post({ json: input });
  },

  async sendUrl(
    opts: CreateAuthenticatedClientOptions,
    input: { url: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createAuthenticatedClient(opts).items.url.$post({ json: input });
  },

  async sendFiles(
    opts: CreateAuthenticatedClientOptions,
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

    return createAuthenticatedClient(opts).items.file.$post({
      form: {
        targetDeviceIds: JSON.stringify(request.targetDeviceIds),
        ...(request.title !== undefined ? { title: request.title } : {}),
        files,
      },
    });
  },

  async fetchPendingDeliveries(opts: CreateAuthenticatedClientOptions) {
    return createAuthenticatedClient(opts).deliveries.pending.$get();
  },

  async acknowledgeDelivery(opts: CreateAuthenticatedClientOptions, deliveryId: string) {
    return createAuthenticatedClient(opts).deliveries[":deliveryId"].ack.$post({
      param: { deliveryId },
    });
  },

  async markDeliveryViewed(opts: CreateAuthenticatedClientOptions, deliveryId: string) {
    return createAuthenticatedClient(opts).deliveries[":deliveryId"].viewed.$post({
      param: { deliveryId },
    });
  },

  async listDeliveries(
    opts: CreateAuthenticatedClientOptions,
    input: { state?: DeliveryListState; limit?: number | string } = {},
  ) {
    return createAuthenticatedClient(opts).deliveries.$get({
      query: {
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getDelivery(opts: CreateAuthenticatedClientOptions, deliveryId: string) {
    return createAuthenticatedClient(opts).deliveries[":deliveryId"].$get({
      param: { deliveryId },
    });
  },

  async listItems(opts: CreateAuthenticatedClientOptions, input: { limit?: number | string } = {}) {
    return createAuthenticatedClient(opts).items.$get({
      query: {
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getItem(opts: CreateAuthenticatedClientOptions, itemId: string) {
    return createAuthenticatedClient(opts).items[":itemId"].$get({
      param: { itemId },
    });
  },

  async downloadDelivery(opts: CreateAuthenticatedClientOptions, deliveryId: string) {
    return createAuthenticatedClient(opts).deliveries[":deliveryId"].download.$get({
      param: { deliveryId },
    });
  },
};
