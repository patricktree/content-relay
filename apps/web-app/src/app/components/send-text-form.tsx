import { Toast } from "@base-ui/react/toast";
import { styled } from "@linaria/react";
import React from "react";
import z from "zod";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import { deviceIdSchema, isValidAbsoluteUrl, relayItemTypeSchema } from "@content-relay/contracts";

import { useSettingsContext } from "#pkg/app/components/settings-context.tsx";
import { DSButton } from "#pkg/app/design-system/button.js";
import { useAppForm } from "#pkg/app/form/form.js";
import {
  useCloseAndroidShareMutation,
  useCompleteAndroidShareMutation,
  usePendingAndroidShareQuery,
} from "#pkg/data-fetching/android-share.js";
import { useAvailableDevicesQuery } from "#pkg/data-fetching/available-devices.js";
import { useRegisteredDeviceQuery } from "#pkg/data-fetching/register-device.js";

export const SendTextForm: React.FC = () => {
  const { settings } = useSettingsContext();
  const pendingAndroidShareQuery = usePendingAndroidShareQuery();

  if (!settings) {
    return null;
  }

  return (
    <SendTextFormContent
      key={pendingAndroidShareQuery.data?.shareId}
      relayHubUrl={settings.relayHubUrl}
      deviceNickname={settings.deviceNickname}
      formDefaultValues={pendingAndroidShareQuery.data ?? undefined}
      hasPendingAndroidShare={
        pendingAndroidShareQuery.data !== null && pendingAndroidShareQuery.data !== undefined
      }
    />
  );
};

type SendTextFormContentProps = {
  relayHubUrl: string;
  deviceNickname: string;
  formDefaultValues: Omit<SendItemFormValues, "targetDeviceIds"> | undefined;
  hasPendingAndroidShare: boolean;
};

type SendItemFormValues = z.infer<typeof sendItemFormSchema>;

const defaultSendItemFormValues: SendItemFormValues = {
  itemType: "text",
  targetDeviceIds: new Set(),
  title: "",
  value: "",
};

const sendItemFormSchema = z
  .object({
    itemType: relayItemTypeSchema,
    targetDeviceIds: z.set(deviceIdSchema).min(1, "Select a target device."),
    title: z.string(),
    value: z.string(),
  })
  .superRefine((value, context) => {
    const trimmedValue = value.value.trim();

    if (value.itemType === "text" && trimmedValue.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Enter the text to send.",
      });
    }

    if (value.itemType === "url" && !isValidAbsoluteUrl(trimmedValue)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Enter a valid absolute URL.",
      });
    }
  });

const SendTextFormContent: React.FC<SendTextFormContentProps> = ({
  relayHubUrl,
  deviceNickname,
  formDefaultValues,
  hasPendingAndroidShare,
}) => {
  const toastManager = Toast.useToastManager();
  const completeAndroidShareMutation = useCompleteAndroidShareMutation();
  const closeAndroidShareMutation = useCloseAndroidShareMutation();
  const registeredDeviceQuery = useRegisteredDeviceQuery({
    relayHubUrl,
    deviceNickname,
  });
  const { deviceId } = registeredDeviceQuery.data;
  const availableDevicesQuery = useAvailableDevicesQuery({ relayHubUrl, deviceId });
  const availableDevices =
    availableDevicesQuery.data?.filter((device) => device.deviceId !== deviceId) ?? [];

  const form = useAppForm({
    defaultValues: {
      ...defaultSendItemFormValues,
      ...formDefaultValues,
    } satisfies SendItemFormValues,
    validators: {
      onChange: sendItemFormSchema,
    },
    onSubmit: async function sendItem({ value }) {
      const deviceRpcClient = new RpcClient(relayHubUrl).createDeviceRpcClient(deviceId);
      const title = value.title.trim();
      const itemValue = value.value.trim();
      const commonRequest = {
        targetDeviceIds: [...value.targetDeviceIds],
        ...(title === "" ? {} : { title }),
      };

      if (value.itemType === "text") {
        await parseOkResponse(
          deviceRpcClient.sendText({
            ...commonRequest,
            text: itemValue,
          }),
        );
      } else {
        await parseOkResponse(
          deviceRpcClient.sendUrl({
            ...commonRequest,
            url: itemValue,
          }),
        );
      }

      if (hasPendingAndroidShare) {
        await completeAndroidShareMutation.mutateAsync({ message: "Item sent" });
      }

      toastManager.add({ title: "Item sent" });
    },
  });

  return (
    <form.Form
      aria-label="Send item"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.AppField
          name="itemType"
          children={(field) => (
            <ItemTypeLabel>
              <ItemTypeLabelText>Item type:</ItemTypeLabelText>
              <ItemTypeSelect
                name="itemType"
                value={field.state.value}
                onBlur={() => field.handleBlur()}
                onChange={(event) =>
                  field.handleChange(relayItemTypeSchema.parse(event.target.value))
                }
              >
                <ItemTypeSelectOption value="text">Text</ItemTypeSelectOption>
                <ItemTypeSelectOption value="url">URL</ItemTypeSelectOption>
              </ItemTypeSelect>
            </ItemTypeLabel>
          )}
        />

        {availableDevicesQuery.isPending ? (
          <>Loading devices...</>
        ) : availableDevicesQuery.isError ? (
          <>Could not load available devices.</>
        ) : (
          <form.AppField
            name="targetDeviceIds"
            children={(field) => (
              <TargetDevicesFieldset>
                <TargetDevicesLegend>Target devices:</TargetDevicesLegend>
                <TargetDevicesUl>
                  {availableDevices.map((device) => (
                    <TargetDeviceLi key={device.deviceId}>
                      <TargetDeviceLabel>
                        <TargetDeviceCheckbox
                          type="checkbox"
                          name="targetDeviceId"
                          value={device.deviceId}
                          checked={field.state.value.has(device.deviceId)}
                          aria-label={`${device.nickname} (${device.platform})`}
                          onBlur={() => field.handleBlur()}
                          onChange={(event) =>
                            field.handleChange((oldValue) => {
                              const newSet = new Set(oldValue);

                              if (event.target.checked) {
                                newSet.add(event.target.value);
                              } else {
                                newSet.delete(event.target.value);
                              }

                              return newSet;
                            })
                          }
                        />
                        <TargetDeviceName>{device.nickname}</TargetDeviceName>
                      </TargetDeviceLabel>
                    </TargetDeviceLi>
                  ))}
                </TargetDevicesUl>

                {!field.state.meta.isValid && (
                  <form.FieldError>
                    {field.state.meta.errors.map((error) => error?.message).join(", ")}
                  </form.FieldError>
                )}
              </TargetDevicesFieldset>
            )}
          />
        )}

        <form.AppField name="title" children={(field) => <field.TextField label="Title:" />} />
        <form.AppField
          name="value"
          children={(field) => (
            <form.Subscribe selector={(state) => state.values.itemType}>
              {(itemType) => <field.TextField label={itemType === "url" ? "URL:" : "Text:"} />}
            </form.Subscribe>
          )}
        />

        <form.Actions>
          {hasPendingAndroidShare && (
            <DSButton
              type="button"
              variant="text"
              disabled={
                closeAndroidShareMutation.isPending || completeAndroidShareMutation.isPending
              }
              onClick={() => {
                void closeAndroidShareMutation.mutateAsync();
              }}
            >
              Cancel
            </DSButton>
          )}
          <form.SubmitButton label="Send" />
        </form.Actions>
      </form.AppForm>
    </form.Form>
  );
};

const ItemTypeLabel = styled.label``;

const ItemTypeLabelText = styled.span``;

const ItemTypeSelect = styled.select``;

const ItemTypeSelectOption = styled.option``;

const TargetDevicesFieldset = styled.fieldset``;

const TargetDevicesLegend = styled.legend``;

const TargetDevicesUl = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: calc(1.5 * var(--spacing-base));
  padding: 0;
  list-style: none;
`;

const TargetDeviceLi = styled.li``;

const TargetDeviceLabel = styled.label`
  /* position: relative so that it is an "anchor" for the child checkbox */
  position: relative;
  /* isolation: isolate so that it is a new stacking context for the child checkbox z-index */
  isolation: isolate;

  display: block;

  & > input[type="checkbox"] {
    position: absolute;
    inset: 0;
    z-index: 1;
    opacity: 0;

    &:hover {
      cursor: pointer;
    }
  }

  &:has(> input[type="checkbox"]:checked) > span {
    background-color: var(--color-selected);
  }

  &:has(> input[type="checkbox"]:focus-visible) > span {
    outline: var(--selected-outline);
    outline-offset: 2px;
  }
`;

const TargetDeviceCheckbox = styled.input`
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
`;

const TargetDeviceName = styled.span`
  --size: 64px;

  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--size);
  width: var(--size);
  border: 1px solid var(--color-fg);
  border-radius: var(--border-radius);
  padding: calc(0.5 * var(--spacing-base));

  overflow: hidden;
  color: var(--color-fg);
  font-size: var(--font-size-sm);
  line-height: 1.1;
  text-align: center;
  overflow-wrap: anywhere;
  user-select: none;
`;
