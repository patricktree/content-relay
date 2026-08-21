import { Toast } from "@base-ui/react/toast";
import React from "react";

import { useSettingsContext } from "#src/app/components/settings-context.tsx";
import { useAppForm } from "#src/app/form/use-app-form.js";
import { settingsSchema } from "#src/settings-storage.js";

type SettingsFormProps = {};

export const SettingsForm: React.FC<SettingsFormProps> = () => {
  const toastManager = Toast.useToastManager();

  const { settings, setSettings } = useSettingsContext();

  const form = useAppForm({
    defaultValues: {
      relayHubUrl: settings?.relayHubUrl ?? "",
      deviceNickname: settings?.deviceNickname ?? "",
    },
    validators: {
      onChange: settingsSchema,
    },
    onSubmit: function saveSettings({ value }) {
      setSettings(value);
      toastManager.add({ title: "Settings saved" });
    },
  });

  return (
    <form.Form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit().catch((error: unknown) => {
          toastManager.add({
            title: "Settings could not be saved",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          });
        });
      }}
    >
      <form.AppForm>
        <form.AppField name="relayHubUrl">
          {(field) => <field.TextField label="Relay Hub URL:" />}
        </form.AppField>
        <form.AppField name="deviceNickname">
          {(field) => <field.TextField label="Device Nickname:" />}
        </form.AppField>
        <form.Actions>
          <form.SubmitButton label="Save" />
        </form.Actions>
      </form.AppForm>
    </form.Form>
  );
};
