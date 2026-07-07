import { $, createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createLogger } from "@patricktree-stack/o11y.logs";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import {
  createItemResponseSchema,
  createTextItemRequestSchema,
  createUrlItemRequestSchema,
  deliveryActionResponseSchema,
  deliveryListResponseSchema,
  deviceListResponseSchema,
  downloadDeliveryResponseSchema,
  errorResponseSchema,
  itemListResponseSchema,
  pushTokenRequestSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
  updateDeviceRequestSchema,
} from "@content-relay/contracts";

import { RelayInvalidInputError, RelayResourceNotFoundError } from "#src/errors.ts";
import {
  presentCreateItemOutput,
  presentDeliveryAction,
  presentDeliveryList,
  presentDeviceList,
  presentDeviceSummary,
  presentDownloadDeliveryOutput,
  presentLoadedItem,
  presentRegisterDeviceOutput,
  presentItemList,
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

const API_TAGS = {
  deliveries: "Deliveries",
  devices: "Devices",
  items: "Items",
} as const;

const deliveryIdParamsSchema = z.object({
  deliveryId: z
    .string()
    .min(1)
    .openapi({
      param: {
        name: "deliveryId",
        in: "path",
      },
      example: "delivery_123",
    }),
});

const deviceIdParamsSchema = z.object({
  deviceId: z
    .string()
    .min(1)
    .openapi({
      param: {
        name: "deviceId",
        in: "path",
      },
      example: "device_123",
    }),
});

const itemIdParamsSchema = z.object({
  itemId: z
    .string()
    .min(1)
    .openapi({
      param: {
        name: "itemId",
        in: "path",
      },
      example: "item_123",
    }),
});

const sourceDeviceQuerySchema = z.object({
  sourceDeviceId: z.string({ error: "Expected `sourceDeviceId` query parameter." }).min(1),
});

const targetDeviceQuerySchema = z.object({
  targetDeviceId: z.string({ error: "Expected `targetDeviceId` query parameter." }).min(1),
});

const deliveryListQuerySchema = z.object({
  targetDeviceId: z.string({ error: "Expected `targetDeviceId` query parameter." }).min(1),
  state: z.enum(["pending", "delivered", "viewed", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  cursor: z.string().min(1).optional(),
});

const itemListQuerySchema = z.object({
  sourceDeviceId: z.string({ error: "Expected `sourceDeviceId` query parameter." }).min(1),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const fileUploadRequestSchema = z.any().openapi({
  type: "object",
  properties: {
    sourceDeviceId: {
      type: "string",
      description: "Device ID that creates the item.",
    },
    targetDeviceIds: {
      type: "string",
      description: "JSON-encoded array of target device IDs.",
    },
    title: {
      type: "string",
    },
    files: {
      type: "array",
      items: {
        type: "string",
        format: "binary",
      },
    },
  },
});

export async function createHonoApp() {
  const app = new OpenAPIHono({
    defaultHook: (result, context) => {
      if (result.success) {
        return undefined;
      }

      return context.json(
        {
          error: getValidationErrorMessage(result.error),
        },
        400,
      );
    },
  });

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

  app.doc("/doc", (context) => ({
    openapi: "3.0.0",
    info: {
      title: "Content Relay API",
      version: "1.0.0",
    },
    servers: [
      {
        url: new URL(context.req.url).origin,
        description: "Current environment",
      },
    ],
  }));

  const publicRoutes = app.openapi(
    createRoute({
      method: "post",
      path: "/devices/register",
      tags: [API_TAGS.devices],
      request: {
        body: {
          content: {
            "application/json": {
              schema: registerDeviceRequestSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        201: {
          content: {
            "application/json": {
              schema: registerDeviceResponseSchema,
            },
          },
          description: "Device registered.",
        },
        400: {
          content: {
            "application/json": {
              schema: errorResponseSchema,
            },
          },
          description: "Invalid request.",
        },
        500: {
          content: {
            "application/json": {
              schema: errorResponseSchema,
            },
          },
          description: "Unexpected Relay Hub error.",
        },
      },
    }),
    async (context) => {
      const registration = await registerDevice(context.req.valid("json"));

      return context.json(presentRegisterDeviceOutput(registration), 201);
    },
  );

  const routes = $(publicRoutes)
    .openapi(
      createRoute({
        method: "get",
        path: "/devices",
        tags: [API_TAGS.devices],
        request: {},
        responses: {
          200: {
            content: {
              "application/json": {
                schema: deviceListResponseSchema,
              },
            },
            description: "Devices listed.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const devices = await listDevices();

        return context.json(presentDeviceList(devices), 200);
      },
    )
    .openapi(
      createRoute({
        method: "patch",
        path: "/devices/{deviceId}",
        tags: [API_TAGS.devices],
        request: {
          params: deviceIdParamsSchema,
          body: {
            content: {
              "application/json": {
                schema: updateDeviceRequestSchema,
              },
            },
            required: true,
          },
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: deviceListResponseSchema.element,
              },
            },
            description: "Device renamed.",
          },
          400: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invalid request.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Device not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { deviceId } = context.req.valid("param");
        const device = await renameDevice(deviceId, context.req.valid("json").nickname);

        return context.json(presentDeviceSummary(device), 200);
      },
    )
    .openapi(
      createRoute({
        method: "delete",
        path: "/devices/{deviceId}",
        tags: [API_TAGS.devices],
        request: {
          params: deviceIdParamsSchema,
        },
        responses: {
          204: {
            description: "Device deleted.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Device not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { deviceId } = context.req.valid("param");

        await deleteDevice(deviceId);

        return context.body(null, 204);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/devices/{deviceId}/push-token",
        tags: [API_TAGS.devices],
        request: {
          params: deviceIdParamsSchema,
          body: {
            content: {
              "application/json": {
                schema: pushTokenRequestSchema,
              },
            },
            required: true,
          },
        },
        responses: {
          204: {
            description: "Push token upserted.",
          },
          400: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invalid request.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Device not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { deviceId } = context.req.valid("param");

        await upsertPushToken(deviceId, context.req.valid("json").token);

        return context.body(null, 204);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/items/text",
        tags: [API_TAGS.items],
        request: {
          body: {
            content: {
              "application/json": {
                schema: createTextItemRequestSchema,
              },
            },
            required: true,
          },
        },
        responses: {
          201: {
            content: {
              "application/json": {
                schema: createItemResponseSchema,
              },
            },
            description: "Text item created.",
          },
          400: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invalid request.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const input = context.req.valid("json");
        const result = await createTextItem(input.sourceDeviceId, {
          text: input.text,
          targetDeviceIds: input.targetDeviceIds,
          ...(input.title !== undefined ? { title: input.title } : {}),
        });

        return context.json(presentCreateItemOutput(result), 201);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/items/url",
        tags: [API_TAGS.items],
        request: {
          body: {
            content: {
              "application/json": {
                schema: createUrlItemRequestSchema,
              },
            },
            required: true,
          },
        },
        responses: {
          201: {
            content: {
              "application/json": {
                schema: createItemResponseSchema,
              },
            },
            description: "URL item created.",
          },
          400: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invalid request.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const input = context.req.valid("json");
        const result = await createUrlItem(input.sourceDeviceId, {
          url: input.url,
          targetDeviceIds: input.targetDeviceIds,
          ...(input.title !== undefined ? { title: input.title } : {}),
        });

        return context.json(presentCreateItemOutput(result), 201);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/items/file",
        tags: [API_TAGS.items],
        request: {
          body: {
            content: {
              "multipart/form-data": {
                schema: fileUploadRequestSchema,
                encoding: {},
              },
            },
            required: true,
          },
        },
        responses: {
          201: {
            content: {
              "application/json": {
                schema: createItemResponseSchema,
              },
            },
            description: "File item created.",
          },
          400: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invalid request.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const input = await parseFileUploadRequest(context.req);
        const result = await createFileItem(input.sourceDeviceId, input);

        return context.json(presentCreateItemOutput(result), 201);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/deliveries",
        tags: [API_TAGS.deliveries],
        request: {
          query: deliveryListQuerySchema,
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: deliveryListResponseSchema,
              },
            },
            description: "Deliveries listed.",
          },
          400: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invalid request.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const query = context.req.valid("query");
        const deliveries = await listDeliveries({
          targetDeviceId: query.targetDeviceId,
          state: query.state ?? "pending",
          limit: query.limit ?? 50,
          cursor: query.cursor,
        });

        return context.json(presentDeliveryList(deliveries), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/deliveries/{deliveryId}",
        tags: [API_TAGS.deliveries],
        request: {
          params: deliveryIdParamsSchema,
          query: targetDeviceQuerySchema,
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: deliveryActionResponseSchema,
              },
            },
            description: "Delivery loaded.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Delivery not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { deliveryId } = context.req.valid("param");
        const { targetDeviceId } = context.req.valid("query");
        const delivery = await getDelivery(targetDeviceId, deliveryId);

        return context.json(presentDeliveryAction(delivery), 200);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/deliveries/{deliveryId}/ack",
        tags: [API_TAGS.deliveries],
        request: {
          params: deliveryIdParamsSchema,
          query: targetDeviceQuerySchema,
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: deliveryActionResponseSchema,
              },
            },
            description: "Delivery acknowledged.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Delivery not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { deliveryId } = context.req.valid("param");
        const { targetDeviceId } = context.req.valid("query");
        const delivery = await acknowledgeDelivery(targetDeviceId, deliveryId);

        return context.json(presentDeliveryAction(delivery), 200);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/deliveries/{deliveryId}/viewed",
        tags: [API_TAGS.deliveries],
        request: {
          params: deliveryIdParamsSchema,
          query: targetDeviceQuerySchema,
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: deliveryActionResponseSchema,
              },
            },
            description: "Delivery marked as viewed.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Delivery not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { deliveryId } = context.req.valid("param");
        const { targetDeviceId } = context.req.valid("query");
        const delivery = await markDeliveryViewed(targetDeviceId, deliveryId);

        return context.json(presentDeliveryAction(delivery), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/deliveries/{deliveryId}/download",
        tags: [API_TAGS.deliveries],
        request: {
          params: deliveryIdParamsSchema,
          query: targetDeviceQuerySchema,
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: downloadDeliveryResponseSchema,
              },
            },
            description: "Delivery content downloaded.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Delivery not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { deliveryId } = context.req.valid("param");
        const { targetDeviceId } = context.req.valid("query");
        const result = await downloadDelivery(targetDeviceId, deliveryId);

        return context.json(presentDownloadDeliveryOutput(result), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/items",
        tags: [API_TAGS.items],
        request: {
          query: itemListQuerySchema,
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: itemListResponseSchema,
              },
            },
            description: "Items listed.",
          },
          400: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invalid request.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { sourceDeviceId, limit = 50 } = context.req.valid("query");
        const items = await listItems(sourceDeviceId, limit);

        return context.json(presentItemList(items), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/items/{itemId}",
        tags: [API_TAGS.items],
        request: {
          params: itemIdParamsSchema,
          query: sourceDeviceQuerySchema,
        },
        responses: {
          200: {
            content: {
              "application/json": {
                schema: itemListResponseSchema.shape.items.element,
              },
            },
            description: "Item loaded.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Item not found.",
          },
          500: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Unexpected Relay Hub error.",
          },
        },
      }),
      async (context) => {
        const { itemId } = context.req.valid("param");
        const { sourceDeviceId } = context.req.valid("query");
        const item = await getItem(sourceDeviceId, itemId);

        return context.json(presentLoadedItem(item), 200);
      },
    );

  return routes;
}

async function parseFileUploadRequest(
  request: Request | { formData(): Promise<FormData> },
): Promise<{
  sourceDeviceId: string;
  title?: string;
  targetDeviceIds: string[];
  files: {
    fileName: string;
    contentType: string;
    content: Uint8Array;
  }[];
}> {
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

async function parseUploadedFiles(uploadedFiles: FormDataEntryValue[]): Promise<
  {
    fileName: string;
    contentType: string;
    content: Uint8Array;
  }[]
> {
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

function getValidationErrorMessage(error: { issues: { message: string }[] }): string {
  const firstIssue = error.issues[0];
  if (firstIssue?.message !== undefined && firstIssue.message.trim() !== "") {
    return firstIssue.message;
  }

  return "Request validation failed.";
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
