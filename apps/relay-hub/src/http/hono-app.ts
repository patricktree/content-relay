import { createLogger } from "@patricktree-stack/o11y.logs";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { createRelayHubApiApp, type RelayHubApiHandlers } from "@content-relay/relay-hub-api";

import { RelayInvalidInputError, RelayResourceNotFoundError } from "#src/errors.ts";
import {
  presentCreateItemOutput,
  presentDeliveryAction,
  presentDeliveryList,
  presentDeviceList,
  presentDeviceSummary,
  presentDownloadDeliveryOutput,
  presentItemList,
  presentLoadedItem,
  presentRegisterDeviceOutput,
} from "#src/http/presenters.ts";
import { instrumentationScopeFromModuleURL } from "#src/observability/instrumentation-scope.ts";
import { acknowledgeDelivery } from "#src/use-cases/acknowledge-delivery.ts";
import { createFileItem } from "#src/use-cases/create-file-item.ts";
import { createTextItem } from "#src/use-cases/create-text-item.ts";
import { createUrlItem } from "#src/use-cases/create-url-item.ts";
import { deleteDevice } from "#src/use-cases/delete-device.ts";
import { downloadDelivery } from "#src/use-cases/download-delivery.ts";
import { getDelivery } from "#src/use-cases/get-delivery.ts";
import { getItem } from "#src/use-cases/get-item.ts";
import { listDeliveries } from "#src/use-cases/list-deliveries.ts";
import { listDevices } from "#src/use-cases/list-devices.ts";
import { listItems } from "#src/use-cases/list-items.ts";
import { markDeliveryViewed } from "#src/use-cases/mark-delivery-viewed.ts";
import { registerDevice } from "#src/use-cases/register-device.ts";
import { renameDevice } from "#src/use-cases/rename-device.ts";
import { upsertPushToken } from "#src/use-cases/upsert-push-token.ts";

const logger = createLogger(instrumentationScopeFromModuleURL(import.meta.url));

const handlers: RelayHubApiHandlers = {
  async registerDevice(context) {
    const registration = await registerDevice(context.req.valid("json"));

    return context.json(presentRegisterDeviceOutput(registration), 201);
  },
  async listDevices(context) {
    return context.json(presentDeviceList(await listDevices()), 200);
  },
  async renameDevice(context) {
    const { deviceId } = context.req.valid("param");
    const device = await renameDevice(deviceId, context.req.valid("json").nickname);

    return context.json(presentDeviceSummary(device), 200);
  },
  async deleteDevice(context) {
    const { deviceId } = context.req.valid("param");

    await deleteDevice(deviceId);

    return context.body(null, 204);
  },
  async upsertPushToken(context) {
    const { deviceId } = context.req.valid("param");

    await upsertPushToken(deviceId, context.req.valid("json").token);

    return context.body(null, 204);
  },
  async createTextItem(context) {
    const input = context.req.valid("json");
    const result = await createTextItem(input.sourceDeviceId, {
      text: input.text,
      targetDeviceIds: input.targetDeviceIds,
      ...(input.title !== undefined ? { title: input.title } : {}),
    });

    return context.json(presentCreateItemOutput(result), 201);
  },
  async createUrlItem(context) {
    const input = context.req.valid("json");
    const result = await createUrlItem(input.sourceDeviceId, {
      url: input.url,
      targetDeviceIds: input.targetDeviceIds,
      ...(input.title !== undefined ? { title: input.title } : {}),
    });

    return context.json(presentCreateItemOutput(result), 201);
  },
  async createFileItem(context) {
    const input = await parseFileUploadRequest(context.req);
    const result = await createFileItem(input.sourceDeviceId, input);

    return context.json(presentCreateItemOutput(result), 201);
  },
  async listDeliveries(context) {
    const query = context.req.valid("query");
    const deliveries = await listDeliveries({
      targetDeviceId: query.targetDeviceId,
      state: query.state ?? "pending",
      limit: query.limit ?? 50,
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });

    return context.json(presentDeliveryList(deliveries), 200);
  },
  async getDelivery(context) {
    const { deliveryId } = context.req.valid("param");
    const { targetDeviceId } = context.req.valid("query");
    const delivery = await getDelivery(targetDeviceId, deliveryId);

    return context.json(presentDeliveryAction(delivery), 200);
  },
  async acknowledgeDelivery(context) {
    const { deliveryId } = context.req.valid("param");
    const { targetDeviceId } = context.req.valid("query");
    const delivery = await acknowledgeDelivery(targetDeviceId, deliveryId);

    return context.json(presentDeliveryAction(delivery), 200);
  },
  async markDeliveryViewed(context) {
    const { deliveryId } = context.req.valid("param");
    const { targetDeviceId } = context.req.valid("query");
    const delivery = await markDeliveryViewed(targetDeviceId, deliveryId);

    return context.json(presentDeliveryAction(delivery), 200);
  },
  async downloadDelivery(context) {
    const { deliveryId } = context.req.valid("param");
    const { targetDeviceId } = context.req.valid("query");
    const result = await downloadDelivery(targetDeviceId, deliveryId);

    return context.json(presentDownloadDeliveryOutput(result), 200);
  },
  async listItems(context) {
    const { sourceDeviceId, limit = 50 } = context.req.valid("query");
    const items = await listItems(sourceDeviceId, limit);

    return context.json(presentItemList(items), 200);
  },
  async getItem(context) {
    const { itemId } = context.req.valid("param");
    const { sourceDeviceId } = context.req.valid("query");
    const item = await getItem(sourceDeviceId, itemId);

    return context.json(presentLoadedItem(item), 200);
  },
};

export async function createHonoApp() {
  return createRelayHubApiApp(handlers, (app) => {
    // Capacitor and Tauri serve bundled apps from local custom origins, so the
    // Relay Hub must explicitly allow them for browser-style requests from native shells.
    app.use(
      "/*",
      cors({
        origin: (origin) =>
          origin.startsWith("http://localhost") ||
          origin.startsWith("https://localhost") ||
          origin.startsWith("http://127.0.0.1") ||
          origin === "tauri://localhost"
            ? origin
            : undefined,
        allowHeaders: ["content-type", "x-relay-device-id"],
        allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      }),
    );

    app.onError((error, context) => {
      const status = getHttpStatus(error);

      logger.error({ error }, "HTTP request failed", {
        method: context.req.method,
        path: context.req.path,
        status,
      });

      return context.json({ error: getErrorMessage(error) }, status);
    });
  });
}

function getHttpStatus(error: unknown): 400 | 401 | 403 | 404 | 500 {
  if (error instanceof HTTPException) {
    switch (error.status) {
      case 400:
      case 401:
      case 403:
      case 404:
      case 500:
        return error.status;
      default:
        return 500;
    }
  }

  if (error instanceof RelayResourceNotFoundError) {
    return 404;
  }

  if (error instanceof RelayInvalidInputError) {
    return 400;
  }

  return 500;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "Unexpected Relay Hub error.";
}

async function parseFileUploadRequest(request: { formData(): Promise<FormData> }) {
  const formData = await request.formData();
  const sourceDeviceId = parseRequiredFormString(formData.get("sourceDeviceId"), "sourceDeviceId");
  const targetDeviceIds = parseTargetDeviceIds(formData.get("targetDeviceIds"));
  const files = await parseUploadedFiles(formData.getAll("files"));
  const title = normalizeOptionalFormString(formData.get("title"));

  return {
    sourceDeviceId,
    ...(title !== undefined ? { title } : {}),
    targetDeviceIds,
    files,
  };
}

async function parseUploadedFiles(uploadedFiles: FormDataEntryValue[]) {
  return Promise.all(
    uploadedFiles.map(async (uploadedFile) => {
      if (!(uploadedFile instanceof File)) {
        throw new HTTPException(400, {
          message: "Expected file uploads in the `files` form field.",
        });
      }

      const arrayBuffer = await uploadedFile.arrayBuffer();

      return {
        fileName: uploadedFile.name,
        contentType: uploadedFile.type || "application/octet-stream",
        content: new Uint8Array(arrayBuffer),
      };
    }),
  );
}

function parseRequiredFormString(value: FormDataEntryValue | null, fieldName: string): string {
  const normalizedValue = normalizeOptionalFormString(value);
  if (normalizedValue === undefined) {
    throw new HTTPException(400, {
      message: `Expected \`${fieldName}\` form field.`,
    });
  }

  return normalizedValue;
}

function normalizeOptionalFormString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    return undefined;
  }

  return trimmedValue;
}

function parseTargetDeviceIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    throw new HTTPException(400, {
      message: "Expected `targetDeviceIds` JSON form field.",
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new HTTPException(400, {
      message: "Expected `targetDeviceIds` to be valid JSON.",
    });
  }

  const result = z.array(z.string()).min(1).safeParse(parsed);
  if (!result.success) {
    throw new HTTPException(400, {
      message: "Expected `targetDeviceIds` to be a non-empty JSON array of strings.",
    });
  }

  return result.data;
}
