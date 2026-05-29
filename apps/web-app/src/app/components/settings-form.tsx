import { Toast } from "@base-ui/react/toast";
import React from "react";

import { useSettingsContext } from "#pkg/app/components/settings-context.tsx";
import { useAppForm } from "#pkg/app/form/use-app-form.js";
import { settingsSchema } from "#pkg/settings-storage.js";

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
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.AppField
          name="relayHubUrl"
          children={(field) => <field.TextField label="Relay Hub URL:" />}
        />
        <form.AppField
          name="deviceNickname"
          children={(field) => <field.TextField label="Device Nickname:" />}
        />
        <form.Actions>
          <form.SubmitButton label="Save" />
        </form.Actions>
      </form.AppForm>
    </form.Form>
  );
};
