import { isValidAbsoluteUrl } from "@content-relay/contracts";

export type ShareDraft = {
  dedupeKey: string;
  itemType: "text" | "url";
  title: string;
  value: string;
};

export function createShareDraft(input: {
  shareId: string;
  text: string;
  title?: string | null | undefined;
}): ShareDraft {
  const shareId = input.shareId.trim();

  if (shareId.length === 0) {
    throw new Error("Expected shared shareId to be non-empty.");
  }

  const value = input.text.trim();

  if (value.length === 0) {
    throw new Error("Expected shared text to be non-empty.");
  }

  const title = input.title?.trim() ?? "";

  return {
    dedupeKey: shareId,
    itemType: isValidAbsoluteUrl(value) ? "url" : "text",
    title,
    value,
  };
}
