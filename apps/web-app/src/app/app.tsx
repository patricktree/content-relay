import { styled } from "@linaria/react";
import React from "react";

import { AppToasts } from "#src/app/components/app-toasts.tsx";
import { DeliveryList } from "#src/app/components/delivery-list.tsx";
import { SendTextForm } from "#src/app/components/send-text-form.tsx";
import { SettingsProvider } from "#src/app/components/settings-context.tsx";
import { SettingsForm } from "#src/app/components/settings-form.tsx";

export const App: React.FC = () => {
  return (
    <>
      <SettingsProvider>
        <PageShell>
          <MainHeading>Content Relay</MainHeading>
          <SendTextForm />
          <DeliveryList />
          <SettingsForm />
        </PageShell>
        <AppToasts />
      </SettingsProvider>
    </>
  );
};

const PageShell = styled.main`
  max-width: 800px;
  margin-inline: auto;
  padding-block: var(--app-padding-block);
  padding-inline: var(--app-padding-inline);
`;

const MainHeading = styled.h1``;
