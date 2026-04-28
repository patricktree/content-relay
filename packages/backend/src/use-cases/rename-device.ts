import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import {
  relayRepositoryToken,
  type DeviceRecord,
} from "#pkg/interfaces/relay-backend-repository.interface.ts";

export type RenameDeviceOutput = DeviceRecord;

export async function renameDevice(
  deviceId: string,
  nickname: string,
): Promise<RenameDeviceOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  return await repository.updateDeviceNickname(deviceId, nickname.trim(), clock.now());
}
