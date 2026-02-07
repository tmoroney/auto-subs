import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Subtitle } from '@/types/interfaces';
import { translateLanguages } from '@/lib/languages';
import i18n from '@/i18n';

interface ProcessingStep {
  id: string;
  title: string;
  description: string;
  progress: number;
  isActive: boolean;
  isCompleted: boolean;
  isCancelled?: boolean;
}

interface ProgressContextType {
  processingSteps: ProcessingStep[];
  livePreviewSegments: Subtitle[];
  clearProgressSteps: () => void;
  completeAllProgressSteps: () => void;
  cancelAllProgressSteps: () => void;
  updateProgressStep: (event: { progress: number; type?: string; label?: string }) => void;
  setupEventListeners: (settings: { targetLanguage: string; language: string; isResolveMode?: boolean; isModelCached?: boolean; enableDiarize?: boolean }) => () => void;
}

const ProgressContext = createContext<ProgressContextType | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [livePreviewSegments, setLivePreviewSegments] = useState<Subtitle[]>([]);
  
  // Track seen segments to prevent duplicates across multiple listener setups
  const seenSegmentsRef = useRef<Set<string>>(new Set());
  
  // Ref to track latest settings for use in closures/callbacks
  const settingsRef = useRef({ targetLanguage: 'en', language: 'auto', isResolveMode: false, isModelCached: false, enableDiarize: false });

  // Simplified progress step management
  const updateProgressStep = (event: { progress: number, type?: string, label?: string }) => {
    // Only process events with known step types - ignore unknown/null types
    const knownTypes = ['Export', 'Download', 'Diarize', 'Transcribe', 'Translate']
    if (!event.type || !knownTypes.includes(event.type)) {
      console.log('Ignoring progress event with unknown type:', event.type)
      return
    }
    
    setProcessingSteps(prev => {
      const stepId = event.type!
      const stepTitle = getStepTitle(event.type)
      const stepOrder = getStepOrder()
      
      // Find existing step
      const existingStepIndex = prev.findIndex(s => s.id === stepId)
      
      if (existingStepIndex >= 0) {
        // Update existing step
        const updated = [...prev]
        updated[existingStepIndex] = {
          ...updated[existingStepIndex],
          progress: event.progress,
          description: `${Math.round(event.progress)}%`,
          isActive: event.progress < 100,
          isCompleted: event.progress >= 100
        }
        
        // When this step is active (progress < 100), set all previous steps to completed
        if (event.progress < 100) {
          const currentStepOrderIndex = stepOrder.indexOf(stepId)
          
          return updated.map((step, index) => {
            const stepOrderIndex = stepOrder.indexOf(step.id)
            const isPreviousStep = currentStepOrderIndex > -1 && stepOrderIndex > -1 && stepOrderIndex < currentStepOrderIndex
            
            return {
              ...step,
              isActive: index === existingStepIndex,
              isCompleted: isPreviousStep || (index === existingStepIndex && event.progress >= 100),
              progress: isPreviousStep ? 100 : step.progress,
              description: isPreviousStep ? '100%' : step.description
            }
          })
        }
        
        return updated
      } else {
        // Add new step
        const newStep: ProcessingStep = {
          id: stepId,
          title: stepTitle,
          description: `${Math.round(event.progress)}%`,
          progress: event.progress,
          isActive: event.progress < 100,
          isCompleted: event.progress >= 100
        }
        
        // When adding new active step, set all previous steps to completed
        if (event.progress < 100) {
          const currentStepOrderIndex = stepOrder.indexOf(stepId)
          
          return prev.map(step => {
            const stepOrderIndex = stepOrder.indexOf(step.id)
            const isPreviousStep = currentStepOrderIndex > -1 && stepOrderIndex > -1 && stepOrderIndex < currentStepOrderIndex
            
            return {
              ...step,
              isActive: false,
              isCompleted: isPreviousStep || step.isCompleted,
              progress: isPreviousStep ? 100 : step.progress,
              description: isPreviousStep ? '100%' : step.description
            }
          }).concat(newStep)
        }
        
        return [...prev, newStep]
      }
    })
  }
  
  const getLanguageDisplayName = (languageCode: string): string => {
    const language = translateLanguages.find((lang: any) => lang.value === languageCode)
    return language ? language.label : languageCode
  }
  
  const getStepTitle = (type?: string): string => {
    switch (type) {
      case 'Export':
        return i18n.t('progressSteps.export', { defaultValue: 'Exporting Audio' });
      case 'Download':
        return i18n.t('progressSteps.download');
      case 'Diarize':
        return i18n.t('progressSteps.diarize', { defaultValue: 'Identifying Speakers' });
      case 'Transcribe':
        return i18n.t('progressSteps.transcribe');
      case 'Translate':
        return i18n.t('progressSteps.translate', {
          language: getLanguageDisplayName(settingsRef.current.targetLanguage),
        });
      default:
        return type || i18n.t('progressSteps.processing');
    }
  }

  // Define the order of progress steps
  const getStepOrder = (): string[] => {
    const order: string[] = []
    if (settingsRef.current.isResolveMode) order.push('Export')
    if (!settingsRef.current.isModelCached) order.push('Download')
    if (settingsRef.current.enableDiarize) order.push('Diarize')
    order.push('Transcribe')
    if (settingsRef.current.targetLanguage && settingsRef.current.targetLanguage !== settingsRef.current.language) {
      order.push('Translate')
    }
    return order
  }
  
  const clearProgressSteps = () => {
    setProcessingSteps([])
    // Also clear live preview segments when starting new transcription
    setLivePreviewSegments([])
    seenSegmentsRef.current.clear()
    console.log('Cleared progress steps and live preview segments');
  }
  
  const completeAllProgressSteps = () => {
    setProcessingSteps(prev => [
      ...prev.map(step => ({
        ...step,
        progress: 100,
        isActive: false,
        isCompleted: true
      })),
      {
        id: 'Complete',
        title: i18n.t('completion.processingComplete'),
        description: i18n.t('completion.subtitlesReady'),
        progress: 100,
        isActive: false,
        isCompleted: true
      }
    ])
  }

  // Cancel all progress steps and show cancelled state
  const cancelAllProgressSteps = () => {
    setProcessingSteps(prev => 
      prev.map(step => ({
        ...step,
        isActive: false,
        isCancelled: step.isActive && !step.isCompleted, // Mark active steps as cancelled
        // Keep completed steps as completed, don't change them
        isCompleted: step.isCompleted
      }))
    )
  }

  // Set up simplified event listener
  const setupEventListeners = useCallback((settings: { targetLanguage: string; language: string; isResolveMode?: boolean; isModelCached?: boolean; enableDiarize?: boolean }) => {
    // Update settings ref
    settingsRef.current = {
      targetLanguage: settings.targetLanguage,
      language: settings.language,
      isResolveMode: settings.isResolveMode ?? false,
      isModelCached: settings.isModelCached ?? false,
      enableDiarize: settings.enableDiarize ?? false,
    };
    
    const setup = async () => {
      try {
        // Single progress listener that directly updates steps array
        await listen<{ progress: number, type?: string, label?: string }>('labeled-progress', (event: { payload: any }) => {
          console.log('Received progress event:', JSON.stringify(event.payload, null, 2));
          updateProgressStep(event.payload);
        });
        
        // New segment listener for live preview
        await listen<string>('new-segment', (event: { payload: any }) => {
          console.log('Received new segment:', event.payload);
          
          // Check if this segment text already exists to prevent duplicates
          const segmentText = event.payload.trim();
          if (!segmentText) {
            console.log('Skipping empty segment');
            return;
          }
          
          // Use the Set to track segments across all listener instances
          if (seenSegmentsRef.current.has(segmentText)) {
            console.log('Skipping duplicate segment (Set):', segmentText);
            return;
          }
          
          // Add to seen segments
          seenSegmentsRef.current.add(segmentText);
          console.log('Adding new segment:', segmentText);
          
          // Create a simple subtitle object from the text
          const newSegment: Subtitle = {
            id: livePreviewSegments.length + 1,
            start: 0,
            end: 0,
            text: event.payload,
            words: [], // Empty array for live preview
            speaker_id: undefined
          };
          
          setLivePreviewSegments(prev => {
            console.log('Current segments count:', prev.length);
            return [...prev, newSegment];
          });
        });
        
        // Clear live preview and seen segments when transcription completes
        await listen('transcription-complete', () => {
          console.log('Transcription complete, clearing live preview');
          setLivePreviewSegments([]);
          seenSegmentsRef.current.clear();
        });
        
      } catch (error) {
        console.error('Failed to set up progress listener:', error);
      }
    };
    
    setup();
    
    // Return cleanup function
    return () => {
      // Cleanup handled automatically by Tauri when component unmounts
    };
  }, []);

  return (
    <ProgressContext.Provider value={{
      processingSteps,
      livePreviewSegments,
      clearProgressSteps,
      completeAllProgressSteps,
      cancelAllProgressSteps,
      updateProgressStep,
      setupEventListeners,
    }}>
      {children}
    </ProgressContext.Provider>
  );
}

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
