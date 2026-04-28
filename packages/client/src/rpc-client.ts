import fs from "node:fs";
import path from "node:path";

import { hcWithType } from "@content-relay/backend";
import {
  assertValidAbsoluteUrl,
  type AuthHeaders,
  type CreateInviteRequest,
  type CreateInviteResponse,
  createInviteResponseSchema,
  type CreateItemResponse,
  createItemResponseSchema,
  type CreateTextItemRequest,
  type CreateUrlItemRequest,
  deliveryActionResponseSchema,
  type DeliveryActionResponse,
  type DeliveryListResponse,
  deliveryListResponseSchema,
  type DeliveryListState,
  type DeliveryResource,
  type DeviceListResponse,
  type DeviceSummary,
  deviceListResponseSchema,
  deviceSummarySchema,
  downloadDeliveryResponseSchema,
  errorResponseSchema,
  type DownloadDeliveryResponse,
  type ItemListEntry,
  itemListResponseSchema,
  type ItemListResponse,
  type RegisterDeviceRequest,
  registerDeviceResponseSchema,
  type RegisterDeviceResponse,
  pushTokenRequestSchema,
  updateDeviceRequestSchema,
} from "@content-relay/shared";

import { simulatePlatformDelivery, type SimulatedDeliveryResult } from "#pkg/platform.ts";
import type { LocalDeviceProfile, LocalDeviceProfileStore } from "#pkg/profile-store.ts";

export type SendFileInput = {
  filePath: string;
  fileName?: string;
  contentType?: string;
};

export type ReceivePendingOptions = {
  acknowledge: boolean;
  simulatePlatform: boolean;
  deduplicate: boolean;
};

export type ReceivedDeliveryResult = {
  delivery: DeliveryResource;
  wasDuplicate: boolean;
  simulation: SimulatedDeliveryResult | null;
};

export class RelayRpcClient {
  async createInvite(
    serverBaseUrl: string,
    request: CreateInviteRequest,
  ): Promise<CreateInviteResponse> {
    const response = await createRpcClient(serverBaseUrl).invites.$post({ json: request });

    return await parseResponse(response, createInviteResponseSchema);
  }

  async registerDevice(
    serverBaseUrl: string,
    request: RegisterDeviceRequest,
  ): Promise<RegisterDeviceResponse> {
    const response = await createRpcClient(serverBaseUrl).devices.register.$post({
      json: request,
    });

    return await parseResponse(response, registerDeviceResponseSchema);
  }

  async listDevices(profile: LocalDeviceProfile): Promise<DeviceListResponse> {
    const response = await createAuthenticatedRpcClient(profile).devices.$get();
    const payload = await parseResponse(response, deviceListResponseSchema);

    return payload;
  }

  async renameDevice(profile: LocalDeviceProfile, nickname: string): Promise<DeviceSummary> {
    const response = await createAuthenticatedRpcClient(profile).devices[":deviceId"].$patch({
      param: { deviceId: profile.deviceId },
      json: updateDeviceRequestSchema.parse({ nickname }),
    });

    return await parseResponse(response, deviceSummarySchema);
  }

  async removeDevice(profile: LocalDeviceProfile): Promise<void> {
    const response = await createAuthenticatedRpcClient(profile).devices[":deviceId"].$delete({
      param: { deviceId: profile.deviceId },
    });

    await parseEmptyResponse(response);
  }

  async upsertPushToken(profile: LocalDeviceProfile, token: string): Promise<void> {
    const response = await createAuthenticatedRpcClient(profile).devices[":deviceId"][
      "push-token"
    ].$post({
      param: { deviceId: profile.deviceId },
      json: pushTokenRequestSchema.parse({ token }),
    });

    await parseEmptyResponse(response);
  }

  async sendText(
    profile: LocalDeviceProfile,
    request: CreateTextItemRequest,
  ): Promise<CreateItemResponse> {
    const response = await createAuthenticatedRpcClient(profile).items.text.$post({
      json: request,
    });

    return await parseResponse(response, createItemResponseSchema);
  }

  async sendUrl(
    profile: LocalDeviceProfile,
    request: CreateUrlItemRequest,
  ): Promise<CreateItemResponse> {
    const response = await createAuthenticatedRpcClient(profile).items.url.$post({
      json: {
        ...request,
        url: assertValidAbsoluteUrl(request.url),
      },
    });

    return await parseResponse(response, createItemResponseSchema);
  }

  async sendFiles(
    profile: LocalDeviceProfile,
    request: { targetDeviceIds: string[]; title?: string; files: SendFileInput[] },
  ): Promise<CreateItemResponse> {
    if (request.files.length === 0) {
      throw new Error("Expected at least one file to upload.");
    }

    const files = await Promise.all(
      request.files.map(async (file) => {
        const fileContent = await fs.promises.readFile(file.filePath);
        const blob = new Blob([fileContent], {
          type: file.contentType ?? "application/octet-stream",
        });

        return new File([blob], file.fileName ?? path.basename(file.filePath), {
          type: file.contentType ?? "application/octet-stream",
        });
      }),
    );

    const response = await createAuthenticatedRpcClient(profile).items.file.$post({
      form: {
        targetDeviceIds: JSON.stringify(request.targetDeviceIds),
        title: request.title,
        files,
      },
    });

    return await parseResponse(response, createItemResponseSchema);
  }

  async listDeliveries(
    profile: LocalDeviceProfile,
    state: DeliveryListState,
    limit: number,
  ): Promise<DeliveryListResponse> {
    const response = await createAuthenticatedRpcClient(profile).deliveries.$get({
      query: {
        limit: String(limit),
        state,
      },
    });

    return await parseResponse(response, deliveryListResponseSchema);
  }

  async fetchPendingDeliveries(profile: LocalDeviceProfile): Promise<DeliveryListResponse> {
    const response = await createAuthenticatedRpcClient(profile).deliveries.pending.$get();

    return await parseResponse(response, deliveryListResponseSchema);
  }

  async getDelivery(profile: LocalDeviceProfile, deliveryId: string): Promise<DeliveryResource> {
    const response = await createAuthenticatedRpcClient(profile).deliveries[":deliveryId"].$get({
      param: { deliveryId },
    });
    const payload = await parseResponse(response, deliveryActionResponseSchema);

    return payload.delivery;
  }

  async acknowledgeDelivery(
    profile: LocalDeviceProfile,
    deliveryId: string,
  ): Promise<DeliveryActionResponse> {
    const response = await createAuthenticatedRpcClient(profile).deliveries[
      ":deliveryId"
    ].ack.$post({
      param: { deliveryId },
    });

    return await parseResponse(response, deliveryActionResponseSchema);
  }

  async markDeliveryViewed(
    profile: LocalDeviceProfile,
    deliveryId: string,
  ): Promise<DeliveryActionResponse> {
    const response = await createAuthenticatedRpcClient(profile).deliveries[
      ":deliveryId"
    ].viewed.$post({
      param: { deliveryId },
    });

    return await parseResponse(response, deliveryActionResponseSchema);
  }

  async listItems(profile: LocalDeviceProfile, limit: number): Promise<ItemListResponse> {
    const response = await createAuthenticatedRpcClient(profile).items.$get({
      query: { limit: String(limit) },
    });

    return await parseResponse(response, itemListResponseSchema);
  }

  async getItem(profile: LocalDeviceProfile, itemId: string): Promise<ItemListEntry> {
    const response = await createAuthenticatedRpcClient(profile).items[":itemId"].$get({
      param: { itemId },
    });
    const payload = await parseResponse(response, itemListResponseSchema.shape.items.element);

    return payload;
  }

  async downloadDelivery(
    profile: LocalDeviceProfile,
    deliveryId: string,
  ): Promise<DownloadDeliveryResponse> {
    const response = await createAuthenticatedRpcClient(profile).deliveries[
      ":deliveryId"
    ].download.$get({
      param: { deliveryId },
    });

    return await parseResponse(response, downloadDeliveryResponseSchema);
  }

  async writeDownloadedDelivery(
    download: DownloadDeliveryResponse,
    outPath?: string,
  ): Promise<string[]> {
    const outputPaths: string[] = [];
    const itemId = download.item.itemId;
    const isSingleFile = download.files.length === 1;
    const baseOutputPath =
      outPath ?? (isSingleFile ? process.cwd() : path.join(process.cwd(), itemId));

    if (isSingleFile) {
      const file = download.files[0];
      if (file === undefined) {
        throw new Error("Expected a single file in the delivery download response.");
      }

      const filePath =
        outPath !== undefined && path.extname(outPath) !== ""
          ? outPath
          : path.join(baseOutputPath, file.fileName);

      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, Buffer.from(file.base64Content, "base64"));
      outputPaths.push(filePath);

      return outputPaths;
    }

    await fs.promises.mkdir(baseOutputPath, { recursive: true });
    for (const file of download.files) {
      const filePath = path.join(baseOutputPath, file.fileName);
      await fs.promises.writeFile(filePath, Buffer.from(file.base64Content, "base64"));
      outputPaths.push(filePath);
    }

    return outputPaths;
  }

  async receivePendingDeliveries(
    profile: LocalDeviceProfile,
    profileStore: LocalDeviceProfileStore,
    options: ReceivePendingOptions,
  ): Promise<ReceivedDeliveryResult[]> {
    const pending = await this.fetchPendingDeliveries(profile);
    const results: ReceivedDeliveryResult[] = [];

    for (const delivery of pending.deliveries) {
      const wasDuplicate = options.deduplicate
        ? await profileStore.hasHandledDelivery(profile.profileId, delivery.deliveryId)
        : false;
      const simulation = options.simulatePlatform
        ? simulatePlatformDelivery(profile.platform, delivery)
        : null;

      if (!wasDuplicate) {
        await profileStore.recordHandledDelivery(profile.profileId, delivery.deliveryId);
      }

      let currentDelivery = delivery;
      if (options.acknowledge) {
        const acknowledged = await this.acknowledgeDelivery(profile, delivery.deliveryId);
        currentDelivery = acknowledged.delivery;
      }

      if (
        simulation !== null &&
        simulation.shouldMarkViewed &&
        options.acknowledge &&
        !wasDuplicate
      ) {
        const viewed = await this.markDeliveryViewed(profile, delivery.deliveryId);
        currentDelivery = viewed.delivery;
      }

      results.push({
        delivery: currentDelivery,
        wasDuplicate,
        simulation,
      });
    }

    return results;
  }
}

function createRpcClient(serverBaseUrl: string, options?: { headers?: AuthHeaders }) {
  return hcWithType(trimTrailingSlash(serverBaseUrl), {
    ...(options?.headers !== undefined ? { headers: options.headers } : {}),
  });
}

function createAuthenticatedRpcClient(profile: LocalDeviceProfile) {
  return createRpcClient(profile.serverBaseUrl, {
    headers: {
      authorization: `Bearer ${profile.authToken}`,
      "x-relay-device-id": profile.deviceId,
    } satisfies AuthHeaders,
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

async function parseResponse<T>(
  response: Response,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  if (!response.ok) {
    throw await createResponseError(response);
  }

  const json = (await response.json()) as unknown;

  return schema.parse(json);
}

async function parseEmptyResponse(response: Response): Promise<void> {
  if (!response.ok) {
    throw await createResponseError(response);
  }
}

async function createResponseError(response: Response): Promise<Error> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = errorResponseSchema.safeParse(await response.json());

    return new Error(
      `Request failed with ${response.status}: ${payload.success ? payload.data.error : "Unknown error"}`,
    );
  }

  return new Error(`Request failed with ${response.status}: ${await response.text()}`);
}
