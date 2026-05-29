import { styled } from "@linaria/react";
import React from "react";

import { AppToasts } from "#pkg/app/components/app-toasts.tsx";
import { SendTextForm } from "#pkg/app/components/send-text-form.tsx";
import { SettingsProvider } from "#pkg/app/components/settings-context.tsx";
import { SettingsForm } from "#pkg/app/components/settings-form.tsx";
import { cssBase } from "#pkg/app/global-styles.js";
import { useSyncAndroidSharesToTanstackQuery } from "#pkg/data-fetching/android-share.js";

export const App: React.FC = () => {
  useSyncAndroidSharesToTanstackQuery();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssBase }} />

      <SettingsProvider>
        <PageShell>
          <MainHeading>Content Relay</MainHeading>
          <SendTextForm />
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
