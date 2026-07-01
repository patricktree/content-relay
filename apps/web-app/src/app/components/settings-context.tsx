import React from "react";

import { reactUtils } from "#pkg/app/react.utils.tsx";
import { settingsStorage, type Settings } from "#pkg/settings-storage.js";

type SettingsContextValue = {
  settings: Settings | undefined;
  setSettings: (settings: Settings) => void;
};

const context = reactUtils.createContext<SettingsContextValue>("SettingsContext");
export const useSettingsContext = context.useContextValue;

type SettingsProviderProps = {
  children: React.ReactNode;
};

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = React.useState<Settings | undefined>(() => {
    return settingsStorage.load() ?? undefined;
  });

  function setSettingsAndStore(newSettings: Settings) {
    setSettings(newSettings);
    settingsStorage.store(newSettings);
  }

  return (
    <context.Provider value={{ settings, setSettings: setSettingsAndStore }}>
      {children}
    </context.Provider>
  );
};
