import React from 'react';
import { SettingsProvider } from './SettingsContext';
import { ModelsProvider } from './ModelsContext';
import { ResolveProvider } from './ResolveContext';
import { TranscriptProvider } from './TranscriptContext';
import { ProgressProvider } from './ProgressContext';
import { PresetsProvider } from './PresetsContext';
import { ErrorDialogProvider } from './ErrorDialogContext';

import { PremiereProvider } from './PremiereContext';

interface GlobalProviderProps {
  children: React.ReactNode;
}

/**
 * GlobalProvider - Composition wrapper that nests all context providers
 * 
 * Provider nesting order (from outermost to innermost):
 * 1. SettingsProvider - Core settings and persistence (leaf context)
 * 2. ModelsProvider - Model management (depends on settings)
 * 3. ResolveProvider - DaVinci Resolve integration (depends on settings)
 * 4. TranscriptProvider - Subtitle/speaker management (depends on settings, resolve)
 * 5. ProgressProvider - Progress tracking and events (depends on settings)
 * 
 * This nesting ensures that inner contexts can access outer context data
 * without creating circular dependencies.
 */
export function GlobalProvider({ children }: GlobalProviderProps) {
  // ErrorDialogProvider is mounted at the outermost layer so any inner
  // provider or component (transcription, Resolve calls, etc.) can reach the
  // single app-wide error dialog via `useErrorDialog()`.
  return (
    <ErrorDialogProvider>
      <SettingsProvider>
        <ModelsProvider>
          <ResolveProvider>
            <PremiereProvider>
              <TranscriptProvider>
                <ProgressProvider>
                  <PresetsProvider>
                    {children}
                  </PresetsProvider>
                </ProgressProvider>
              </TranscriptProvider>
            </PremiereProvider>
          </ResolveProvider>
        </ModelsProvider>
      </SettingsProvider>
    </ErrorDialogProvider>
  );
}
