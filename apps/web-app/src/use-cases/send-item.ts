import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { CreateItemResponse } from "@content-relay/contracts";
import { isValidAbsoluteUrl } from "@content-relay/contracts";

export type SendItemType = "text" | "url";

export type RegisteredDeviceProfile = {
  deviceId: string;
  relayHubBaseUrl: string;
};

export type SendItemInput = {
  itemType: SendItemType;
  profile: RegisteredDeviceProfile;
  targetDeviceIds: string[];
  title: string;
  value: string;
};

export type ValidatedSendItemInput = {
  itemType: SendItemType;
  profile: RegisteredDeviceProfile;
  targetDeviceIds: string[];
  title?: string;
  value: string;
};

export function validateSendItemInput(input: SendItemInput): ValidatedSendItemInput {
  const targetDeviceIds = Array.from(new Set(input.targetDeviceIds.map((id) => id.trim()))).filter(
    (id) => id.length > 0,
  );

  if (targetDeviceIds.length === 0) {
    throw new Error("Choose at least one target device.");
  }

  const relayHubBaseUrl = input.profile.relayHubBaseUrl.trim();

  if (relayHubBaseUrl.length === 0) {
    throw new Error("Enter the Relay Hub URL.");
  }

  const deviceId = input.profile.deviceId.trim();

  if (deviceId.length === 0) {
    throw new Error("Enter this device ID.");
  }

  const trimmedTitle = input.title.trim();
  const trimmedValue = input.value.trim();

  if (input.itemType === "text" && trimmedValue.length === 0) {
    throw new Error("Enter the text to send.");
  }

  if (input.itemType === "url" && !isValidAbsoluteUrl(trimmedValue)) {
    throw new Error("Enter a valid absolute URL.");
  }

  return {
    itemType: input.itemType,
    profile: {
      deviceId,
      relayHubBaseUrl: trimTrailingSlash(relayHubBaseUrl),
    },
    targetDeviceIds,
    ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
    value: trimmedValue,
  };
}

export async function sendItem(input: SendItemInput): Promise<CreateItemResponse> {
  const validatedInput = validateSendItemInput(input);

  if (validatedInput.targetDeviceIds.length === 0) {
    throw new Error("Choose at least one target device.");
  }

  if (validatedInput.itemType === "text") {
    return parseOkResponse(
      new RpcClient(validatedInput.profile.relayHubBaseUrl)
        .createDeviceRpcClient(validatedInput.profile.deviceId)
        .sendText({
          text: validatedInput.value,
          targetDeviceIds: validatedInput.targetDeviceIds,
          ...(validatedInput.title !== undefined ? { title: validatedInput.title } : {}),
        }),
    );
  }

  return parseOkResponse(
    new RpcClient(validatedInput.profile.relayHubBaseUrl)
      .createDeviceRpcClient(validatedInput.profile.deviceId)
      .sendUrl({
        url: validatedInput.value,
        targetDeviceIds: validatedInput.targetDeviceIds,
        ...(validatedInput.title !== undefined ? { title: validatedInput.title } : {}),
      }),
  );
}

export function formatSendSuccessMessage(
  itemType: SendItemType,
  itemId: string,
  deliveryCount: number,
): string {
  if (itemType === "text") {
    return `Sent text item ${itemId} to ${deliveryCount} device(s).`;
  }

  return `Sent URL item ${itemId} to ${deliveryCount} device(s).`;
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, "");
}
