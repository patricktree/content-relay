import { Toast } from "@base-ui/react/toast";
import { styled } from "@linaria/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import React from "react";

import { relayItemTypeSchema } from "@content-relay/contracts";

import { useSettingsContext } from "#src/app/components/settings-context.tsx";
import { DSButton } from "#src/app/design-system/button.js";
import { useAppForm } from "#src/app/form/use-app-form.js";
import { useAndroidShareIntent } from "#src/app/use-android-share-intent.js";
import { sendItemSchema, type SendItemInput } from "#src/application/send-item.js";
import { createCurrentDeviceQuery } from "#src/data-fetching/current-device.js";
import { createRelayHubItemSender } from "#src/data-fetching/send-item.js";

export const SendTextForm: React.FC = () => {
  const { settings } = useSettingsContext();
  const androidShareIntent = useAndroidShareIntent();

  if (!settings || androidShareIntent.isLoading) {
    return null;
  }

  return (
    <SendTextFormContent
      key={androidShareIntent.draft?.shareId}
      relayHubUrl={settings.relayHubUrl}
      deviceNickname={settings.deviceNickname}
      formDefaultValues={androidShareIntent.draft ?? undefined}
      androidShareIntent={androidShareIntent}
    />
  );
};

type SendTextFormContentProps = {
  relayHubUrl: string;
  deviceNickname: string;
  formDefaultValues: Omit<SendItemFormValues, "targetDeviceIds"> | undefined;
  androidShareIntent: ReturnType<typeof useAndroidShareIntent>;
};

type SendItemFormValues = SendItemInput;

const defaultSendItemFormValues: SendItemFormValues = {
  itemType: "text",
  targetDeviceIds: new Set(),
  title: "",
  value: "",
};

const SendTextFormContent: React.FC<SendTextFormContentProps> = ({
  relayHubUrl,
  deviceNickname,
  formDefaultValues,
  androidShareIntent,
}) => {
  const toastManager = Toast.useToastManager();
  const currentDeviceQuery = useSuspenseQuery(
    createCurrentDeviceQuery({ relayHubUrl, deviceNickname }),
  );
  const { deviceId } = currentDeviceQuery.data.currentDevice;
  const sendItem = createRelayHubItemSender({
    relayHubUrl,
    sourceDeviceId: deviceId,
    ...(androidShareIntent.draft === null
      ? {}
      : {
          completePendingAndroidShare: async () => {
            await androidShareIntent.complete();
          },
        }),
  });

  const form = useAppForm({
    defaultValues: {
      ...defaultSendItemFormValues,
      ...formDefaultValues,
    } satisfies SendItemFormValues,
    validators: {
      onChange: sendItemSchema,
    },
    onSubmit: async function submitItem({ value }) {
      await sendItem(value);

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
        <form.AppField name="itemType">
          {(field) => (
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
        </form.AppField>

        <form.AppField name="targetDeviceIds">
          {(field) => (
            <TargetDevicesFieldset>
              <TargetDevicesLegend>Target devices:</TargetDevicesLegend>
              <TargetDevicesUl>
                {currentDeviceQuery.data.eligibleTargetDevices.map((device) => (
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
        </form.AppField>

        <form.AppField name="title">{(field) => <field.TextField label="Title:" />}</form.AppField>
        <form.AppField name="value">
          {(field) => (
            <form.Subscribe selector={(state) => state.values.itemType}>
              {(itemType) => <field.TextField label={itemType === "url" ? "URL:" : "Text:"} />}
            </form.Subscribe>
          )}
        </form.AppField>

        <form.Actions>
          {androidShareIntent.draft !== null && (
            <DSButton
              type="button"
              variant="text"
              disabled={androidShareIntent.isSettling}
              onClick={() => {
                void androidShareIntent.cancel();
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
