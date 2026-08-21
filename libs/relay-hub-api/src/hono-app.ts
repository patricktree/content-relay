import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";

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

const registerDeviceRoute = createRoute({
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
});

const listDevicesRoute = createRoute({
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
});

const renameDeviceRoute = createRoute({
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
});

const deleteDeviceRoute = createRoute({
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
});

const upsertPushTokenRoute = createRoute({
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
});

const createTextItemRoute = createRoute({
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
});

const createUrlItemRoute = createRoute({
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
});

const createFileItemRoute = createRoute({
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
});

const listDeliveriesRoute = createRoute({
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
});

const getDeliveryRoute = createRoute({
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
});

const acknowledgeDeliveryRoute = createRoute({
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
});

const markDeliveryViewedRoute = createRoute({
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
});

const downloadDeliveryRoute = createRoute({
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
});

const listItemsRoute = createRoute({
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
});

const getItemRoute = createRoute({
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
});

export type RelayHubApiHandlers = {
  registerDevice: RouteHandler<typeof registerDeviceRoute>;
  listDevices: RouteHandler<typeof listDevicesRoute>;
  renameDevice: RouteHandler<typeof renameDeviceRoute>;
  deleteDevice: RouteHandler<typeof deleteDeviceRoute>;
  upsertPushToken: RouteHandler<typeof upsertPushTokenRoute>;
  createTextItem: RouteHandler<typeof createTextItemRoute>;
  createUrlItem: RouteHandler<typeof createUrlItemRoute>;
  createFileItem: RouteHandler<typeof createFileItemRoute>;
  listDeliveries: RouteHandler<typeof listDeliveriesRoute>;
  getDelivery: RouteHandler<typeof getDeliveryRoute>;
  acknowledgeDelivery: RouteHandler<typeof acknowledgeDeliveryRoute>;
  markDeliveryViewed: RouteHandler<typeof markDeliveryViewedRoute>;
  downloadDelivery: RouteHandler<typeof downloadDeliveryRoute>;
  listItems: RouteHandler<typeof listItemsRoute>;
  getItem: RouteHandler<typeof getItemRoute>;
};

type ConfigureRelayHubApiApp = (app: OpenAPIHono) => void;

export function createRelayHubApiApp(
  handlers: RelayHubApiHandlers,
  configureApp?: ConfigureRelayHubApiApp,
) {
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

  configureApp?.(app);

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

  const routes = app
    .openapi(registerDeviceRoute, handlers.registerDevice)
    .openapi(listDevicesRoute, handlers.listDevices)
    .openapi(renameDeviceRoute, handlers.renameDevice)
    .openapi(deleteDeviceRoute, handlers.deleteDevice)
    .openapi(upsertPushTokenRoute, handlers.upsertPushToken)
    .openapi(createTextItemRoute, handlers.createTextItem)
    .openapi(createUrlItemRoute, handlers.createUrlItem)
    .openapi(createFileItemRoute, handlers.createFileItem)
    .openapi(listDeliveriesRoute, handlers.listDeliveries)
    .openapi(getDeliveryRoute, handlers.getDelivery)
    .openapi(acknowledgeDeliveryRoute, handlers.acknowledgeDelivery)
    .openapi(markDeliveryViewedRoute, handlers.markDeliveryViewed)
    .openapi(downloadDeliveryRoute, handlers.downloadDelivery)
    .openapi(listItemsRoute, handlers.listItems)
    .openapi(getItemRoute, handlers.getItem);

  return routes;
}

export function createRelayHubApiContractApp() {
  return createRelayHubApiApp({
    registerDevice: unavailableHandler,
    listDevices: unavailableHandler,
    renameDevice: unavailableHandler,
    deleteDevice: unavailableHandler,
    upsertPushToken: unavailableHandler,
    createTextItem: unavailableHandler,
    createUrlItem: unavailableHandler,
    createFileItem: unavailableHandler,
    listDeliveries: unavailableHandler,
    getDelivery: unavailableHandler,
    acknowledgeDelivery: unavailableHandler,
    markDeliveryViewed: unavailableHandler,
    downloadDelivery: unavailableHandler,
    listItems: unavailableHandler,
    getItem: unavailableHandler,
  });
}

function unavailableHandler(): never {
  throw new Error("The Relay Hub API contract app cannot handle requests.");
}

function getValidationErrorMessage(error: { issues: { message: string }[] }): string {
  const firstIssue = error.issues[0];
  if (firstIssue?.message !== undefined && firstIssue.message.trim() !== "") {
    return firstIssue.message;
  }

  return "Request validation failed.";
}
