import { type PluginListenerHandle } from "@capacitor/core";
import { z } from "zod";

export const sharePayloadSchema = z.object({
  shareId: z.uuid(),
  text: z.string().trim().min(1),
  title: z.string().trim().min(1).nullable().optional(),
});
export const consumePendingShareResponseSchema = z.object({
  share: sharePayloadSchema.nullable().optional(),
});

export type ShareCompletion = {
  message: string;
};

type SharePayload = z.infer<typeof sharePayloadSchema>;

export type SharePlugin = {
  closeShareOverlay(): Promise<void>;
  completeShareOverlay(input: ShareCompletion): Promise<void>;
  consumePendingShare(): Promise<z.infer<typeof consumePendingShareResponseSchema>>;
  addListener(
    eventName: "shareIntentReceived",
    listenerFunc: (payload: SharePayload) => void,
  ): Promise<PluginListenerHandle>;
};
