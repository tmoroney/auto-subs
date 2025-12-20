import React, { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Model } from '@/types/interfaces';
import { models } from '@/lib/models';

interface ModelsContextType {
  modelsState: Model[];
  setModelsState: (models: Model[]) => void;
  checkDownloadedModels: () => Promise<void>;
  handleDeleteModel: (modelValue: string) => Promise<void>;
}

const ModelsContext = createContext<ModelsContextType | null>(null);

export function ModelsProvider({ children }: { children: React.ReactNode }) {
  const [modelsState, setModelsState] = useState(models);

  async function checkDownloadedModels() {
    try {
      const downloadedModels = await invoke("get_downloaded_models") as string[]
      console.log("Downloaded models:", downloadedModels)

      const updatedModels = models.map(model => ({
        ...model,
        isDownloaded: downloadedModels.some(downloadedModel =>
          downloadedModel === model.value
        )
      }))
      setModelsState(updatedModels)
    } catch (error) {
      console.error("Failed to check downloaded models:", error)
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
