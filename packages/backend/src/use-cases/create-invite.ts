import { randomUUID } from "node:crypto";

import { getDiContainer } from "#pkg/dependency-container-context.ts";
import { clockToken } from "#pkg/interfaces/clock.interface.ts";
import { relayRepositoryToken } from "#pkg/interfaces/relay-backend-repository.interface.ts";
import { randomToken, serverBaseUrlToken } from "#pkg/use-cases/shared.ts";

export type CreateInviteOutput = {
  inviteCode: string;
  inviteUrl: string;
  expiresAt: string;
};

export async function createInvite(expiresInSeconds: number): Promise<CreateInviteOutput> {
  const repository = getDiContainer().inject(relayRepositoryToken);
  const clock = getDiContainer().inject(clockToken);
  const serverBaseUrl = getDiContainer().inject(serverBaseUrlToken);

  const createdAt = clock.now();
  const inviteCode = randomToken();
  const inviteId = `inv_${randomUUID()}`;
  const expiresAt = clock.addSeconds(createdAt, expiresInSeconds);

  await repository.createInvite({
    id: inviteId,
    code: inviteCode,
    createdAt,
    expiresAt,
    usedAt: null,
  });

  return {
    inviteCode,
    inviteUrl: `${serverBaseUrl}/invites/${inviteCode}`,
    expiresAt,
  };
}
