import React from 'react';
import { SettingsProvider } from './SettingsContext';
import { ModelsProvider } from './ModelsContext';
import { ResolveProvider } from './ResolveContext';
import { TranscriptProvider } from './TranscriptContext';
import { ProgressProvider } from './ProgressContext';

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
  return (
    <SettingsProvider>
      <ModelsProvider>
        <ResolveProvider>
          <TranscriptProvider>
            <ProgressProvider>
              {children}
            </ProgressProvider>
          </TranscriptProvider>
        </ResolveProvider>
      </ModelsProvider>
    </SettingsProvider>
  );
}
