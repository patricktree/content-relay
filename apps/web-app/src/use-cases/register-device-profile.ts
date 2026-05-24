import { parseOkResponse, RpcClient } from "@content-relay/client";
import type { RegisterDeviceResponse } from "@content-relay/contracts";

export type RegisterDeviceProfileInput = {
  deviceNickname: string;
  relayHubBaseUrl: string;
};

export type ValidatedRegisterDeviceProfileInput = {
  deviceNickname: string;
  relayHubBaseUrl: string;
};

export function validateRegisterDeviceProfileInput(
  input: RegisterDeviceProfileInput,
): ValidatedRegisterDeviceProfileInput {
  const relayHubBaseUrl = input.relayHubBaseUrl.trim();

  if (relayHubBaseUrl.length === 0) {
    throw new Error("Enter the Relay Hub URL.");
  }

  const deviceNickname = input.deviceNickname.trim();

  if (deviceNickname.length === 0) {
    throw new Error("Enter this device nickname.");
  }

  return {
    deviceNickname,
    relayHubBaseUrl: trimTrailingSlash(relayHubBaseUrl),
  };
}

export async function registerDeviceProfile(
  input: RegisterDeviceProfileInput,
): Promise<RegisterDeviceResponse> {
  const validatedInput = validateRegisterDeviceProfileInput(input);

  return parseOkResponse(
    new RpcClient(validatedInput.relayHubBaseUrl).registerDevice({
      nickname: validatedInput.deviceNickname,
      platform: "generic",
    }),
  );
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, "");
}
