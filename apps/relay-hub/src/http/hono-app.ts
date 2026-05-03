import { $, createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { createLogger } from "@content-relay/o11y.logs";
import {
  createInviteRequestSchema,
  createInviteResponseSchema,
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
} from "@content-relay/shared";

import {
  RelayAuthenticationFailedError,
  RelayInvalidInputError,
  RelayResourceNotFoundError,
} from "#pkg/errors.ts";
import {
  presentCreateInviteOutput,
  presentCreateItemOutput,
  presentDeliveryAction,
  presentDeliveryList,
  presentDeviceList,
  presentDeviceSummary,
  presentDownloadDeliveryOutput,
  presentLoadedItem,
  presentRegisterDeviceOutput,
  presentItemList,
} from "#pkg/http/presenters.ts";
import { instrumentationScopeFromModuleURL } from "#pkg/observability/instrumentation-scope.ts";
import { acknowledgeDelivery } from "#pkg/use-cases/acknowledge-delivery.ts";
import { authenticateDevice } from "#pkg/use-cases/authenticate-device.ts";
import { createFileItem } from "#pkg/use-cases/create-file-item.ts";
import { createInvite } from "#pkg/use-cases/create-invite.ts";
import { createTextItem } from "#pkg/use-cases/create-text-item.ts";
import { createUrlItem } from "#pkg/use-cases/create-url-item.ts";
import { deleteDevice } from "#pkg/use-cases/delete-device.ts";
import { downloadDelivery } from "#pkg/use-cases/download-delivery.ts";
import { getDelivery } from "#pkg/use-cases/get-delivery.ts";
import { getItem } from "#pkg/use-cases/get-item.ts";
import { listDeliveries } from "#pkg/use-cases/list-deliveries.ts";
import { listDevices } from "#pkg/use-cases/list-devices.ts";
import { listItems } from "#pkg/use-cases/list-items.ts";
import { listPendingDeliveries } from "#pkg/use-cases/list-pending-deliveries.ts";
import { markDeliveryViewed } from "#pkg/use-cases/mark-delivery-viewed.ts";
import { registerDevice } from "#pkg/use-cases/register-device.ts";
import { renameDevice } from "#pkg/use-cases/rename-device.ts";
import { upsertPushToken } from "#pkg/use-cases/upsert-push-token.ts";

const logger = createLogger(instrumentationScopeFromModuleURL(import.meta.url));

const API_TAGS = {
  deliveries: "Deliveries",
  devices: "Devices",
  invites: "Invites",
  items: "Items",
} as const;

const AUTH_SECURITY = [{ RelayDeviceIdHeader: [] }];
const allowedCorsOrigins = ["https://localhost"];
const allowedCorsHeaders = ["content-type", "x-relay-device-id"];
const allowedCorsMethods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"];

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

const deliveryListQuerySchema = z.object({
  state: z.enum(["pending", "delivered", "viewed", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const itemListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const fileUploadRequestSchema = z.any().openapi({
  type: "object",
  properties: {
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

type HonoEnvironment = {
  Variables: {
    authenticatedDeviceId: string;
  };
};

type AuthenticatedContext = Context<HonoEnvironment>;

const authenticateProtectedRoute: MiddlewareHandler<HonoEnvironment> = async (context, next) => {
  if (context.req.method === "OPTIONS") {
    await next();

    return;
  }

  await authenticateRequest(context);
  await next();
};

export async function createHonoApp() {
  const app = new OpenAPIHono<HonoEnvironment>({
    defaultHook: (result, context) => {
      if (result.success) {
        return;
      }

      return context.json(
        {
          error: getValidationErrorMessage(result.error),
        },
        400,
      );
    },
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "RelayDeviceIdHeader", {
    type: "apiKey",
    in: "header",
    name: "x-relay-device-id",
  });

  // Capacitor serves the bundled app from https://localhost, so the Relay Hub must
  // explicitly allow that origin for browser-style requests from the mobile shell.
  app.use(
    "/*",
    cors({
      origin: allowedCorsOrigins,
      allowHeaders: allowedCorsHeaders,
      allowMethods: allowedCorsMethods,
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

  const publicRoutes = app
    .openapi(
      createRoute({
        method: "post",
        path: "/invites",
        tags: [API_TAGS.invites],
        request: {
          body: {
            content: {
              "application/json": {
                schema: createInviteRequestSchema,
              },
            },
            required: true,
          },
        },
        responses: {
          201: {
            content: {
              "application/json": {
                schema: createInviteResponseSchema,
              },
            },
            description: "Invite created.",
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
        const { expiresInSeconds } = context.req.valid("json");
        const invite = await createInvite(expiresInSeconds);

        return context.json(presentCreateInviteOutput(invite), 201);
      },
    )
    .openapi(
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
          },
          404: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Invite not found.",
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

  const routes = $(
    publicRoutes
      .use("/devices", authenticateProtectedRoute)
      .use("/devices/:deviceId", authenticateProtectedRoute)
      .use("/devices/:deviceId/push-token", authenticateProtectedRoute)
      .use("/items", authenticateProtectedRoute)
      .use("/items/*", authenticateProtectedRoute)
      .use("/deliveries", authenticateProtectedRoute)
      .use("/deliveries/*", authenticateProtectedRoute),
  )
    .openapi(
      createRoute({
        method: "get",
        path: "/devices",
        tags: [API_TAGS.devices],
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
          },
          403: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Forbidden.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deviceId } = context.req.valid("param");

        assertAuthenticatedDeviceMatchesTargetDevice(
          authenticatedDeviceId,
          deviceId,
          "Cannot rename another device.",
        );

        const device = await renameDevice(deviceId, context.req.valid("json").nickname);

        return context.json(presentDeviceSummary(device), 200);
      },
    )
    .openapi(
      createRoute({
        method: "delete",
        path: "/devices/{deviceId}",
        tags: [API_TAGS.devices],
        security: AUTH_SECURITY,
        request: {
          params: deviceIdParamsSchema,
        },
        responses: {
          204: {
            description: "Device deleted.",
          },
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
          },
          403: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Forbidden.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deviceId } = context.req.valid("param");

        assertAuthenticatedDeviceMatchesTargetDevice(
          authenticatedDeviceId,
          deviceId,
          "Cannot remove another device.",
        );

        await deleteDevice(deviceId);

        return context.body(null, 204);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/devices/{deviceId}/push-token",
        tags: [API_TAGS.devices],
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
          },
          403: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Forbidden.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deviceId } = context.req.valid("param");

        assertAuthenticatedDeviceMatchesTargetDevice(
          authenticatedDeviceId,
          deviceId,
          "Cannot update another device.",
        );

        await upsertPushToken(deviceId, context.req.valid("json").token);

        return context.body(null, 204);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/items/text",
        tags: [API_TAGS.items],
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const input = context.req.valid("json");
        const result = await createTextItem(authenticatedDeviceId, {
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
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const input = context.req.valid("json");
        const result = await createUrlItem(authenticatedDeviceId, {
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
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const input = await parseFileUploadRequest(context.req);
        const result = await createFileItem(authenticatedDeviceId, input);

        return context.json(presentCreateItemOutput(result), 201);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/deliveries/pending",
        tags: [API_TAGS.deliveries],
        security: AUTH_SECURITY,
        request: {},
        responses: {
          200: {
            content: {
              "application/json": {
                schema: deliveryListResponseSchema,
              },
            },
            description: "Pending deliveries listed.",
          },
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const deliveries = await listPendingDeliveries(authenticatedDeviceId);

        return context.json(presentDeliveryList(deliveries), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/deliveries",
        tags: [API_TAGS.deliveries],
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const query = context.req.valid("query");
        const deliveries = await listDeliveries(
          authenticatedDeviceId,
          query.state ?? "pending",
          query.limit ?? 50,
        );

        return context.json(presentDeliveryList(deliveries), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/deliveries/{deliveryId}",
        tags: [API_TAGS.deliveries],
        security: AUTH_SECURITY,
        request: {
          params: deliveryIdParamsSchema,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deliveryId } = context.req.valid("param");
        const delivery = await getDelivery(authenticatedDeviceId, deliveryId);

        return context.json(presentDeliveryAction(delivery), 200);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/deliveries/{deliveryId}/ack",
        tags: [API_TAGS.deliveries],
        security: AUTH_SECURITY,
        request: {
          params: deliveryIdParamsSchema,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deliveryId } = context.req.valid("param");
        const delivery = await acknowledgeDelivery(authenticatedDeviceId, deliveryId);

        return context.json(presentDeliveryAction(delivery), 200);
      },
    )
    .openapi(
      createRoute({
        method: "post",
        path: "/deliveries/{deliveryId}/viewed",
        tags: [API_TAGS.deliveries],
        security: AUTH_SECURITY,
        request: {
          params: deliveryIdParamsSchema,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deliveryId } = context.req.valid("param");
        const delivery = await markDeliveryViewed(authenticatedDeviceId, deliveryId);

        return context.json(presentDeliveryAction(delivery), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/deliveries/{deliveryId}/download",
        tags: [API_TAGS.deliveries],
        security: AUTH_SECURITY,
        request: {
          params: deliveryIdParamsSchema,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deliveryId } = context.req.valid("param");
        const result = await downloadDelivery(authenticatedDeviceId, deliveryId);

        return context.json(presentDownloadDeliveryOutput(result), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/items",
        tags: [API_TAGS.items],
        security: AUTH_SECURITY,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { limit = 50 } = context.req.valid("query");
        const items = await listItems(authenticatedDeviceId, limit);

        return context.json(presentItemList(items), 200);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/items/{itemId}",
        tags: [API_TAGS.items],
        security: AUTH_SECURITY,
        request: {
          params: itemIdParamsSchema,
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
          401: {
            content: {
              "application/json": {
                schema: errorResponseSchema,
              },
            },
            description: "Authentication failed.",
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
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { itemId } = context.req.valid("param");
        const item = await getItem(authenticatedDeviceId, itemId);

        return context.json(presentLoadedItem(item), 200);
      },
    );

  return routes;
}

async function authenticateRequest(context: AuthenticatedContext): Promise<void> {
  const deviceId = context.req.header("x-relay-device-id");

  if (deviceId === undefined) {
    throw new HTTPException(401, {
      message: "Missing x-relay-device-id header.",
    });
  }

  await authenticateDevice(deviceId);
  context.set("authenticatedDeviceId", deviceId);
}

function assertAuthenticatedDeviceMatchesTargetDevice(
  authenticatedDeviceId: string,
  targetDeviceId: string,
  errorMessage: string,
): void {
  if (authenticatedDeviceId === targetDeviceId) {
    return;
  }

  throw new HTTPException(403, { message: errorMessage });
}

async function parseFileUploadRequest(
  request: Request | { formData(): Promise<FormData> },
): Promise<{
  title?: string;
  targetDeviceIds: string[];
  files: {
    fileName: string;
    contentType: string;
    content: Uint8Array;
  }[];
}> {
  const formData = await request.formData();
  const targetDeviceIds = parseTargetDeviceIds(formData.get("targetDeviceIds"));
  const files = await parseUploadedFiles(formData.getAll("files"));
  const title = normalizeOptionalFormString(formData.get("title"));

  return {
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

  if (error instanceof RelayAuthenticationFailedError) {
    return 401;
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
