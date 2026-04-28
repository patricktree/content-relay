import { assertValidAbsoluteUrl } from "@content-relay/shared";

import { createItem, type CreateItemOutput } from "#pkg/use-cases/create-item.ts";

export async function createUrlItem(
  sourceDeviceId: string,
  input: {
    url: string;
    title?: string;
    targetDeviceIds: string[];
  },
): Promise<CreateItemOutput> {
  return await createItem(sourceDeviceId, {
    type: "url",
    ...(input.title !== undefined ? { title: input.title } : {}),
    url: assertValidAbsoluteUrl(input.url),
    targetDeviceIds: input.targetDeviceIds,
  });
}
