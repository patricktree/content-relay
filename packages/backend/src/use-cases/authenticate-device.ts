import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayAuthenticationFailedError } from "#pkg/errors.ts";
import { authTokenManagerToken } from "#pkg/interfaces/auth-token-manager.interface.ts";
import {
  relayRepositoryToken,
  type DeviceRecord,
} from "#pkg/interfaces/relay-backend-repository.interface.ts";

export async function authenticateDevice(
  deviceId: string,
  authToken: string,
): Promise<DeviceRecord> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const authTokenManager = getDiContainer().inject(authTokenManagerToken);

  const device = await repository.findActiveDeviceById(deviceId);

  if (device === null) {
    throw new RelayAuthenticationFailedError("Device authentication failed.");
  }

  const isValid = await authTokenManager.verify(authToken, device.authTokenHash);
  if (!isValid) {
    throw new RelayAuthenticationFailedError("Device authentication failed.");
  }

  return device;
}
