import { Model } from "@/components/settings-cards/model-selection-card";

/**
 * Centralized model definitions for AutoSubs
 * These model definitions are used throughout the application
 * to ensure consistency in model information display
 */
export const models: Model[] = [
  {
    value: "tiny",
    label: "Tiny",
    description: "Fastest",
    size: "80MB",
    ram: "1GB",
    image: "/hummingbird.png",
    details: "Smallest and fastest model. Great for drafts and low-resource devices. Lower accuracy on tough audio.",
    isDownloaded: true,
  },
  {
    value: "base",
    label: "Base",
    description: "General use",
    size: "150MB",
    ram: "1GB",
    image: "/sparrow.png",
    details: "Balanced for most standard tasks. Good speed and accuracy for everyday transcription.",
    isDownloaded: true,
  },
  {
    value: "small",
    label: "Small",
    description: "Balanced",
    size: "480MB",
    ram: "2GB",
    image: "/fox.png",
    details: "Better accuracy than Tiny/Base. Still fast. Good for varied accents and conditions.",
    isDownloaded: false,
  },
  {
    value: "medium",
    label: "Medium",
    description: "Accurate",
    size: "1.5GB",
    ram: "5GB",
    image: "/wolf.png",
    details: "High accuracy, handles difficult audio. Slower and uses more memory.",
    isDownloaded: false,
  },
  {
    value: "large",
    label: "Large",
    description: "Max accuracy",
    size: "3.1GB",
    ram: "10GB",
    image: "/elephant.png",
    details: "Most accurate, best for complex audio or many speakers. Requires lots of RAM and a strong GPU.",
    isDownloaded: false,
  },
];

/**
 * Get a specific model by its value
 * @param value The model value to look up
 * @returns The model object or undefined if not found
 */
export function getModelByValue(value: string): Model | undefined {
  return models.find(model => model.value === value);
}

/**
 * Get the default model (currently set to "base")
 * @returns The default model object
 */
export function getDefaultModel(): Model {
  return models[1]; // Base model is at index 1
}
