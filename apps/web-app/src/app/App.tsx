import { styled } from "@linaria/react";
import React from "react";

import { AppToasts } from "#pkg/app/components/app-toasts.tsx";
import { SendTextForm } from "#pkg/app/components/send-text-form.tsx";
import { SettingsProvider } from "#pkg/app/components/settings-context.tsx";
import { SettingsForm } from "#pkg/app/components/settings-form.tsx";

type AppProps = {};

export const App: React.FC<AppProps> = () => {
  return (
    <SettingsProvider>
      <PageShell>
        <SendTextForm />
        <SettingsForm />
      </PageShell>
      <AppToasts />
    </SettingsProvider>
  );
};

const PageShell = styled.main`
  display: grid;
  justify-items: center;
  min-height: 100vh;
  max-width: 800px;
`;
