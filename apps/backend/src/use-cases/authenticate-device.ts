import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { RelayAuthenticationFailedError } from "#pkg/errors.ts";
import {
  type DeviceRecord,
  relayRepositoryToken,
} from "#pkg/interfaces/relay-backend-repository.interface.ts";

export async function authenticateDevice(deviceId: string): Promise<DeviceRecord> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const device = await repository.findActiveDeviceById(deviceId);

  if (device === null) {
    throw new RelayAuthenticationFailedError("Device authentication failed.");
  }

  return device;
}
