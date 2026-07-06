import { getDiContainer } from "#src/dependency-container-context.ts";
import { clockToken } from "#src/interfaces/clock.interface.ts";
import {
  relayRepositoryToken,
  type DeviceRecord,
} from "#src/interfaces/relay-hub-repository.interface.ts";

export type RenameDeviceOutput = DeviceRecord;

export async function renameDevice(
  deviceId: string,
  nickname: string,
): Promise<RenameDeviceOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  return await repository.updateDeviceNickname(deviceId, nickname.trim(), clock.now());
}
