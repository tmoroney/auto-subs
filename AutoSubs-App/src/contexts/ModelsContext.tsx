import React, { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Model } from '@/types';
import { models } from '@/lib/models';

interface ModelsContextType {
  modelsState: Model[];
  downloadedModelValues: string[];
  setModelsState: (models: Model[]) => void;
  checkDownloadedModels: () => Promise<void>;
  handleDeleteModel: (modelValue: string) => Promise<void>;
}

const ModelsContext = createContext<ModelsContextType | null>(null);

export function ModelsProvider({ children }: { children: React.ReactNode }) {
  const [modelsState, setModelsState] = useState(models);
  const [downloadedModelValues, setDownloadedModelValues] = useState<string[]>([]);

  async function checkDownloadedModels() {
    // The backend command can fail transiently when invoked during window
    // startup. The result was fetched exactly once on mount with no retry,
    // so a single transient failure left the "Manage downloaded models"
    // dialog permanently empty until the next transcription finished.
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      try {
        const downloadedModels = await invoke("get_downloaded_models") as string[]
        console.log("Downloaded models:", downloadedModels)
        setDownloadedModelValues(downloadedModels)

        const updatedModels = models.map(model => ({
          ...model,
          isDownloaded: downloadedModels.some(downloadedModel =>
            downloadedModel === model.value
          )
        }))
        setModelsState(updatedModels)
        return
      } catch (error) {
        console.error(`Failed to check downloaded models (attempt ${attempt}/${maxAttempts}):`, error)
        if (attempt >= maxAttempts) return
        await new Promise(resolve => setTimeout(resolve, attempt * 1000))
      }
    }
  }

  // Initialize models on mount
  useEffect(() => {
    checkDownloadedModels();
  }, []);

  // Function to delete a model
  const handleDeleteModel = async (modelValue: string) => {
    try {
      // Call the backend to delete the model files
      await invoke('delete_model', { model: modelValue });

      // Update the models state
      await checkDownloadedModels();

      console.log(`Successfully deleted model: ${modelValue}`);
    } catch (error) {
      console.error(`Failed to delete model ${modelValue}:`, error);
      // You could add a toast notification here to inform the user of the error
    }
  };

  return (
    <ModelsContext.Provider value={{
      modelsState,
      downloadedModelValues,
      setModelsState,
      checkDownloadedModels,
      handleDeleteModel,
    }}>
      {children}
    </ModelsContext.Provider>
  );
}

export const useModels = () => {
  const context = useContext(ModelsContext);
  if (!context) {
    throw new Error('useModels must be used within a ModelsProvider');
  }
  return context;
};
