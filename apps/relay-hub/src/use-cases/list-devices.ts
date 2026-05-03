import { getDiContainer } from "#pkg/dependency-container-context.ts";
import {
  relayRepositoryToken,
  type DeviceRecord,
} from "#pkg/interfaces/relay-hub-repository.interface.ts";

export type ListDevicesOutput = DeviceRecord[];

export async function listDevices(): Promise<ListDevicesOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);

  return await repository.listActiveDevices();
}
