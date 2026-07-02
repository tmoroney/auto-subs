import React, { createContext, useContext } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

export type Integration = "davinci" | "premiere" | "aftereffects";

interface IntegrationContextType {
  selectedIntegration: Integration;
  setSelectedIntegration: (integration: Integration) => void;
}

const IntegrationContext = createContext<IntegrationContextType | null>(null);

export function IntegrationProvider({ children }: { children: React.ReactNode }) {
  const selectedIntegration = useSettingsStore((s) => s.preferredEditorIntegration);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const setSelectedIntegration = React.useCallback((integration: Integration) => {
    updateSetting("preferredEditorIntegration", integration);
  }, [updateSetting]);

  return (
    <IntegrationContext.Provider value={{ selectedIntegration, setSelectedIntegration }}>
      {children}
    </IntegrationContext.Provider>
  );
}

export const useIntegration = () => {
  const context = useContext(IntegrationContext);
  if (!context) {
    throw new Error('useIntegration must be used within an IntegrationProvider');
  }
  return context;
};
