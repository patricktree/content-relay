import { getDiContainer } from "#src/dependency-container-context.ts";
import { clockToken } from "#src/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#src/interfaces/relay-hub-repository.interface.ts";

export async function deleteDevice(deviceId: string): Promise<void> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  await repository.softDeleteDevice(deviceId, clock.now());
}
