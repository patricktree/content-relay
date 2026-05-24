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

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, "");
}
