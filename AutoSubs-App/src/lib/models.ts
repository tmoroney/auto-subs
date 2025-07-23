import { Model } from "@/types/interfaces";

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
    details: "Agile and lightweight like a hummingbird. Best for drafts, low-resource devices, and simple audio. Quick but less accurate on tough speech.",
    isDownloaded: true,
  },
  {
    value: "base",
    label: "Base",
    description: "General use",
    size: "150MB",
    ram: "1GB",
    image: "/otter.png",
    details: "Agile and resourceful as an otter. Excels at everyday transcription with reliable speed and accuracy.",
    isDownloaded: true,
  },
  {
    value: "small",
    label: "Small",
    description: "Balanced",
    size: "480MB",
    ram: "2GB",
    image: "/fox.png",
    details: "Clever and versatile as a fox. Better accuracy than Tiny/Base. Still fast. Good for varied accents and conditions.",
    isDownloaded: false,
  },
  {
    value: "medium",
    label: "Medium",
    description: "Accurate",
    size: "1.5GB",
    ram: "5GB",
    image: "/owl.png",
    details: "Sharp and discerning like an owl. Offers high accuracy, especially adept at handling challenging audio conditions. A balanced choice for precision.",
    isDownloaded: false,
  },
  {
    value: "large-v3-turbo",
    label: "Large-Turbo",
    description: "Reborn Speed",
    size: "1.6GB",
    ram: "6GB",
    image: "/phoenix.png",
    details: "Swift and efficient like a phoenix rising. Delivers near-Large accuracy at significantly higher speed.",
    isDownloaded: false,
  },
  {
    value: "large-v3",
    label: "Large",
    description: "Max accuracy",
    size: "3.1GB",
    ram: "10GB",
    image: "/elephant.png",
    details: "Powerful and thorough as an elephant. Most accurate, best for complex audio or many speakers. Requires lots of RAM and a strong GPU.",
    isDownloaded: false,
  },
];
