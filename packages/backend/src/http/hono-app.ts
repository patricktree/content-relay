import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { createLogger } from "@content-relay/o11y.logs";
import {
  createInviteRequestSchema,
  createTextItemRequestSchema,
  createUrlItemRequestSchema,
  pushTokenRequestSchema,
  registerDeviceRequestSchema,
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
  presentEmptyResponse,
  presentErrorResponse,
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

const deliveryListQuerySchema = z.object({
  state: z.enum(["pending", "delivered", "viewed", "all"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const itemListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
});

type HonoEnvironment = {
  Variables: {
    authenticatedDeviceId: string;
  };
};

type AuthenticatedContext = Context<HonoEnvironment>;

export async function createHonoApp() {
  const app = new Hono<HonoEnvironment>();

  app.onError((error, context) => {
    const status = getHttpStatus(error);

    logger.error({ error }, "HTTP request failed", {
      method: context.req.method,
      path: context.req.path,
      status,
    });

    return context.json(presentErrorResponse(error), status);
  });

  const authenticateDeviceRoutes = async (
    context: AuthenticatedContext,
    next: () => Promise<void>,
  ) => {
    if (context.req.path === "/devices/register") {
      await next();

      return;
    }

    await authenticateRequest(context);
    await next();
  };

  const authenticateProtectedRoutes = async (
    context: AuthenticatedContext,
    next: () => Promise<void>,
  ) => {
    await authenticateRequest(context);
    await next();
  };

  const routes = app
    .use("/devices", authenticateDeviceRoutes)
    .use("/devices/*", authenticateDeviceRoutes)
    .use("/items", authenticateProtectedRoutes)
    .use("/items/*", authenticateProtectedRoutes)
    .use("/deliveries", authenticateProtectedRoutes)
    .use("/deliveries/*", authenticateProtectedRoutes)
    .post("/invites", validateJsonRequest(createInviteRequestSchema), async (context) => {
      const { expiresInSeconds } = context.req.valid("json");
      const invite = await createInvite(expiresInSeconds);

      return context.json(presentCreateInviteOutput(invite), 201);
    })
    .post(
      "/devices/register",
      validateJsonRequest(registerDeviceRequestSchema),
      async (context) => {
        const registration = await registerDevice(context.req.valid("json"));

        return context.json(presentRegisterDeviceOutput(registration), 201);
      },
    )
    .get("/devices", async (context) => {
      const devices = await listDevices();

      return context.json(presentDeviceList(devices));
    })
    .patch(
      "/devices/:deviceId",
      validateJsonRequest(updateDeviceRequestSchema),
      async (context) => {
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deviceId } = context.req.param();
        if (deviceId !== authenticatedDeviceId) {
          throw new HTTPException(403, { message: "Cannot rename another device." });
        }

        const device = await renameDevice(deviceId, context.req.valid("json").nickname);

        return context.json(presentDeviceSummary(device));
      },
    )
    .delete("/devices/:deviceId", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const { deviceId } = context.req.param();
      if (deviceId !== authenticatedDeviceId) {
        throw new HTTPException(403, { message: "Cannot remove another device." });
      }

      await deleteDevice(deviceId);

      return context.body(presentEmptyResponse(), 204);
    })
    .post(
      "/devices/:deviceId/push-token",
      validateJsonRequest(pushTokenRequestSchema),
      async (context) => {
        const authenticatedDeviceId = context.get("authenticatedDeviceId");
        const { deviceId } = context.req.param();
        if (deviceId !== authenticatedDeviceId) {
          throw new HTTPException(403, { message: "Cannot update another device." });
        }

        await upsertPushToken(deviceId, context.req.valid("json").token);

        return context.body(presentEmptyResponse(), 204);
      },
    )
    .post("/items/text", validateJsonRequest(createTextItemRequestSchema), async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const input = context.req.valid("json");
      const result = await createTextItem(authenticatedDeviceId, {
        text: input.text,
        targetDeviceIds: input.targetDeviceIds,
        ...(input.title !== undefined ? { title: input.title } : {}),
      });

      return context.json(presentCreateItemOutput(result), 201);
    })
    .post("/items/url", validateJsonRequest(createUrlItemRequestSchema), async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const input = context.req.valid("json");
      const result = await createUrlItem(authenticatedDeviceId, {
        url: input.url,
        targetDeviceIds: input.targetDeviceIds,
        ...(input.title !== undefined ? { title: input.title } : {}),
      });

      return context.json(presentCreateItemOutput(result), 201);
    })
    .post("/items/file", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const formData = await context.req.formData();
      const targetDeviceIds = parseTargetDeviceIds(formData.get("targetDeviceIds"));
      const titleValue = formData.get("title");
      const uploadedFiles = formData.getAll("files");

      const files = await Promise.all(
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

      const result = await createFileItem(authenticatedDeviceId, {
        ...(typeof titleValue === "string" && titleValue.trim() !== ""
          ? { title: titleValue }
          : {}),
        targetDeviceIds,
        files,
      });

      return context.json(presentCreateItemOutput(result), 201);
    })
    .get("/deliveries/pending", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const deliveries = await listPendingDeliveries(authenticatedDeviceId);

      return context.json(presentDeliveryList(deliveries));
    })
    .get("/deliveries", validateQueryRequest(deliveryListQuerySchema), async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const query = context.req.valid("query");
      const deliveries = await listDeliveries(
        authenticatedDeviceId,
        query.state ?? "pending",
        query.limit ?? 50,
      );

      return context.json(presentDeliveryList(deliveries));
    })
    .get("/deliveries/:deliveryId", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const { deliveryId } = context.req.param();
      const delivery = await getDelivery(authenticatedDeviceId, deliveryId);

      return context.json(presentDeliveryAction(delivery));
    })
    .post("/deliveries/:deliveryId/ack", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const { deliveryId } = context.req.param();
      const delivery = await acknowledgeDelivery(authenticatedDeviceId, deliveryId);

      return context.json(presentDeliveryAction(delivery));
    })
    .post("/deliveries/:deliveryId/viewed", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const { deliveryId } = context.req.param();
      const delivery = await markDeliveryViewed(authenticatedDeviceId, deliveryId);

      return context.json(presentDeliveryAction(delivery));
    })
    .get("/deliveries/:deliveryId/download", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const { deliveryId } = context.req.param();
      const result = await downloadDelivery(authenticatedDeviceId, deliveryId);

      return context.json(presentDownloadDeliveryOutput(result));
    })
    .get("/items", validateQueryRequest(itemListQuerySchema), async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const { limit = 50 } = context.req.valid("query");
      const items = await listItems(authenticatedDeviceId, limit);

      return context.json(presentItemList(items));
    })
    .get("/items/:itemId", async (context) => {
      const authenticatedDeviceId = context.get("authenticatedDeviceId");
      const { itemId } = context.req.param();
      const item = await getItem(authenticatedDeviceId, itemId);

      return context.json(presentLoadedItem(item));
    });

  return routes;
}

async function authenticateRequest(context: AuthenticatedContext): Promise<void> {
  const deviceId = context.req.header("x-relay-device-id");
  const authorization = context.req.header("authorization");

  if (deviceId === undefined || authorization === undefined) {
    throw new HTTPException(401, {
      message: "Missing device authentication headers.",
    });
  }

  const authToken = authorization.replace(/^Bearer\s+/i, "").trim();
  await authenticateDevice(deviceId, authToken);
  context.set("authenticatedDeviceId", deviceId);
}

function validateJsonRequest<TSchema extends z.ZodType>(schema: TSchema) {
  return zValidator("json", schema, (result) => {
    if (result.success) {
      return;
    }

    throw new HTTPException(400, {
      message: getValidationErrorMessage(result.error),
    });
  });
}

function validateQueryRequest<TSchema extends z.ZodType>(schema: TSchema) {
  return zValidator("query", schema, (result) => {
    if (result.success) {
      return;
    }

    throw new HTTPException(400, {
      message: getValidationErrorMessage(result.error),
    });
  });
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
