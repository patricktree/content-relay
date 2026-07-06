import { getDiContainer } from "#src/dependency-container-context.ts";
import { RelayInvalidInputError } from "#src/errors.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";

export async function resolveTargetDevices(targetDeviceIds: string[]): Promise<string[]> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  const uniqueTargetDeviceIds = [...new Set(targetDeviceIds)];

  if (uniqueTargetDeviceIds.length === 0) {
    throw new RelayInvalidInputError("Expected at least one target device.");
  }

  const devices = await Promise.all(
    uniqueTargetDeviceIds.map(async (deviceId) => await repository.findActiveDeviceById(deviceId)),
  );
  const missingDeviceId = uniqueTargetDeviceIds.find((_deviceId, index) => devices[index] === null);

  if (missingDeviceId !== undefined) {
    throw new RelayInvalidInputError(`Unknown target device: ${missingDeviceId}`);
  }

  return uniqueTargetDeviceIds;
}
