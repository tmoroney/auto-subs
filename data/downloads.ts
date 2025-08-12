import { DownloadOption } from "@/types/interfaces";

export const downloads: DownloadOption[] = [
  {
    name: 'AutoSubs for Windows',
    version: 'v3.0',
    size: '68 MB',
    os: 'Windows',
    downloadUrl: 'https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe',
    isRecommended: false,
  },
  {
    name: 'AutoSubs for macOS (Apple Silicon)',
    version: 'v3.0',
    size: '66 MB',
    os: 'macOS',
    downloadUrl: 'https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg',
    isRecommended: true,
  },
  {
    name: 'AutoSubs for macOS (Intel)',
    version: 'v3.0',
    size: '67 MB',
    os: 'macOS',
    downloadUrl: 'https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-Intel.pkg',
    isRecommended: false,
  }
]