import { RelayInvalidInputError } from "#pkg/errors.ts";
import { createItem, type CreateItemOutput } from "#pkg/use-cases/create-item.ts";
import { isLikelyUrl } from "#pkg/use-cases/shared.ts";

export async function createTextItem(
  sourceDeviceId: string,
  input: {
    text: string;
    title?: string;
    targetDeviceIds: string[];
  },
): Promise<CreateItemOutput> {
  if (input.text.includes("\n") === false && isLikelyUrl(input.text)) {
    throw new RelayInvalidInputError(
      "The payload looks like a URL. Use the typed URL send flow instead of the text send flow.",
    );
  }

  return await createItem(sourceDeviceId, {
    type: "text",
    ...(input.title !== undefined ? { title: input.title } : {}),
    text: input.text,
    targetDeviceIds: input.targetDeviceIds,
  });
}
