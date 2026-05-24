import { Toast } from "@base-ui/react/toast";
import { styled } from "@linaria/react";
import React from "react";
import z from "zod";

import { parseOkResponse, RpcClient } from "@content-relay/client";
import { deviceIdSchema, isValidAbsoluteUrl, relayItemTypeSchema } from "@content-relay/contracts";

import { useSettingsContext } from "#pkg/app/components/settings-context.tsx";
import { useAppForm } from "#pkg/app/form/create-form-hook.ts";
import { useAvailableDevices } from "#pkg/data-fetching/available-devices.js";

export const SendTextForm: React.FC = () => {
  const { settings } = useSettingsContext();
  if (!settings) {
    return null;
  }

  return <SendTextFormContent relayHubUrl={settings.relayHubUrl} deviceId={settings.deviceId} />;
};

type SendTextFormContentProps = {
  relayHubUrl: string;
  deviceId: string;
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

const SendTextFormContent: React.FC<SendTextFormContentProps> = ({ relayHubUrl, deviceId }) => {
  const toastManager = Toast.useToastManager();
  const availableDevicesQuery = useAvailableDevices({ relayHubUrl, deviceId });
  const availableDevices =
    availableDevicesQuery.data?.filter((device) => device.deviceId !== deviceId) ?? [];

  const form = useAppForm({
    defaultValues: defaultSendItemFormValues,
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

      toastManager.add({ title: "Item sent" });
    },
  });

  return (
    <Form
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
                    </TargetDeviceLi>
                  ))}
                </TargetDevicesUl>
              </TargetDevicesFieldset>
            )}
          />
        )}

        <ItemDetails>
          <form.AppField name="title" children={(field) => <field.TextField label="Title:" />} />
          <form.AppField
            name="value"
            children={(field) => (
              <form.Subscribe selector={(state) => state.values.itemType}>
                {(itemType) => <field.TextField label={itemType === "url" ? "URL:" : "Text:"} />}
              </form.Subscribe>
            )}
          />
        </ItemDetails>

        <FormActions>
          <form.SubmitButton label="Send" />
        </FormActions>
      </form.AppForm>
    </Form>
  );
};

const Form = styled.form``;

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
  list-style: none;
`;

const TargetDeviceLi = styled.li``;

const TargetDeviceCheckbox = styled.input`
  border: 2px solid var(--color-fg);
  border-radius: 4px;

  &:hover {
    cursor: pointer;
  }

  &:focus-visible {
    outline: var(--selected-outline);
  }

  &:checked {
    color: var(--color-selected);
  }
`;

const TargetDeviceName = styled.span``;

const ItemDetails = styled.div`
  display: grid;
  gap: 28px;
`;

const FormActions = styled.div`
  display: flex;
  justify-content: end;
`;
