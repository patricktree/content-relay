import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-backend-repository.interface.ts";

export async function deleteDevice(deviceId: string): Promise<void> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);

  await repository.softDeleteDevice(deviceId, clock.now());
}
