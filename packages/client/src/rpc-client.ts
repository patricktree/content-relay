import fs from "node:fs";
import path from "node:path";

import type { DevicePlatform, DeliveryListState, PushRegistration } from "@content-relay/shared";

import { createAuthenticatedClient, createRelayHttpClient } from "#pkg/http-client.ts";
import type { LocalDeviceProfile } from "#pkg/profile-store.ts";

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

  async listDevices(profile: LocalDeviceProfile) {
    return createAuthenticatedClient(profile).devices.$get();
  },

  async renameDevice(profile: LocalDeviceProfile, nickname: string) {
    return createAuthenticatedClient(profile).devices[":deviceId"].$patch({
      param: { deviceId: profile.deviceId },
      json: { nickname },
    });
  },

  async deleteDevice(profile: LocalDeviceProfile) {
    return createAuthenticatedClient(profile).devices[":deviceId"].$delete({
      param: { deviceId: profile.deviceId },
    });
  },

  async setPushToken(profile: LocalDeviceProfile, token: string) {
    return createAuthenticatedClient(profile).devices[":deviceId"]["push-token"].$post({
      param: { deviceId: profile.deviceId },
      json: { token },
    });
  },

  async sendText(
    profile: LocalDeviceProfile,
    input: { text: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createAuthenticatedClient(profile).items.text.$post({ json: input });
  },

  async sendUrl(
    profile: LocalDeviceProfile,
    input: { url: string; targetDeviceIds: string[]; title?: string },
  ) {
    return createAuthenticatedClient(profile).items.url.$post({ json: input });
  },

  async sendFiles(
    profile: LocalDeviceProfile,
    request: { targetDeviceIds: string[]; title?: string; files: { filePath: string }[] },
  ) {
    const files = await Promise.all(
      request.files.map(async (file) => {
        const content = await fs.promises.readFile(file.filePath);

        return new File([content], path.basename(file.filePath));
      }),
    );

    return createAuthenticatedClient(profile).items.file.$post({
      form: {
        targetDeviceIds: JSON.stringify(request.targetDeviceIds),
        ...(request.title !== undefined ? { title: request.title } : {}),
        files,
      },
    });
  },

  async fetchPendingDeliveries(profile: LocalDeviceProfile) {
    return createAuthenticatedClient(profile).deliveries.pending.$get();
  },

  async acknowledgeDelivery(profile: LocalDeviceProfile, deliveryId: string) {
    return createAuthenticatedClient(profile).deliveries[":deliveryId"].ack.$post({
      param: { deliveryId },
    });
  },

  async markDeliveryViewed(profile: LocalDeviceProfile, deliveryId: string) {
    return createAuthenticatedClient(profile).deliveries[":deliveryId"].viewed.$post({
      param: { deliveryId },
    });
  },

  async listDeliveries(
    profile: LocalDeviceProfile,
    input: { state?: DeliveryListState; limit?: number | string } = {},
  ) {
    return createAuthenticatedClient(profile).deliveries.$get({
      query: {
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getDelivery(profile: LocalDeviceProfile, deliveryId: string) {
    return createAuthenticatedClient(profile).deliveries[":deliveryId"].$get({
      param: { deliveryId },
    });
  },

  async listItems(profile: LocalDeviceProfile, input: { limit?: number | string } = {}) {
    return createAuthenticatedClient(profile).items.$get({
      query: {
        ...(input.limit !== undefined ? { limit: String(input.limit) } : {}),
      },
    });
  },

  async getItem(profile: LocalDeviceProfile, itemId: string) {
    return createAuthenticatedClient(profile).items[":itemId"].$get({
      param: { itemId },
    });
  },

  async downloadDelivery(profile: LocalDeviceProfile, deliveryId: string) {
    return createAuthenticatedClient(profile).deliveries[":deliveryId"].download.$get({
      param: { deliveryId },
    });
  },
};
