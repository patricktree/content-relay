import { Toast } from "@base-ui/react/toast";
import React from "react";
import z from "zod";

import { deviceIdSchema } from "@content-relay/contracts";

import { useSettingsContext } from "#pkg/app/components/settings-context.tsx";
import { useAppForm } from "#pkg/app/form/create-form-hook.ts";

type SettingsFormProps = {};

export const SettingsForm: React.FC<SettingsFormProps> = () => {
  const toastManager = Toast.useToastManager();

  const { settings, setSettings } = useSettingsContext();

  const form = useAppForm({
    defaultValues: {
      relayHubUrl: settings?.relayHubUrl ?? "",
      deviceId: settings?.deviceId ?? "",
    },
    validators: {
      onChange: z.object({
        relayHubUrl: z.url(),
        deviceId: deviceIdSchema,
      }),
    },
    onSubmit: function saveSettings({ value }) {
      setSettings(value);
      toastManager.add({ title: "Settings saved" });
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.AppField
          name="relayHubUrl"
          children={(field) => <field.TextField label="Relay Hub URL:" />}
        />
        <form.AppField
          name="deviceId"
          children={(field) => <field.TextField label="Device ID:" />}
        />
        <form.SubmitButton label="Save" />
      </form.AppForm>
    </form>
  );
};
