export const site = {
  name: "AutoSubs",
  tagline: "Local AI subtitles",
  description:
    "Free, open-source AI subtitles that run entirely on your own machine. Use AutoSubs on its own, or wired straight into DaVinci Resolve, Premiere Pro and After Effects.",
  repo: "https://github.com/tmoroney/auto-subs",
  releases: "https://github.com/tmoroney/auto-subs/releases",
  issues: "https://github.com/tmoroney/auto-subs/issues/new/choose",
  // The README download table covers every installer plus Homebrew and the
  // Linux install commands, which the bare releases page does not.
  allDownloads: "https://github.com/tmoroney/auto-subs#download",
  contributing: "https://github.com/tmoroney/auto-subs/blob/main/CONTRIBUTING.md",
  discord: "https://discord.gg/TBC",
  donate: "https://www.buymeacoffee.com/tmoroney",
  developer: "https://tom-moroney.com",
  // Shields-style endpoint the app's README already uses for its badges.
  downloadsEndpoint: "https://tom-moroney.com/release-tracker/data/badge-downloads.json",
} as const;

export type DownloadTarget = {
  label: string;
  note: string;
  url: string;
};

export const downloads: Record<string, DownloadTarget> = {
  mac_arm: {
    label: "Download for macOS",
    note: "Apple Silicon",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg",
  },
  mac_intel: {
    label: "Download for macOS",
    note: "Intel",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-Intel.pkg",
  },
  windows: {
    label: "Download for Windows",
    note: "x86_64",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe",
  },
  linux: {
    label: "Download for Linux",
    note: ".deb",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.deb",
  },
  linux_rpm: {
    label: "Download for Linux",
    note: ".rpm",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.rpm",
  },
  other: {
    label: "Download AutoSubs",
    note: "All platforms",
    url: "https://github.com/tmoroney/auto-subs/releases/latest",
  },
};

/* Everything the browser cannot work out on its own, shown in the download
   popover. Order runs most to least common. */
export const downloadMenu: { label: string; note: string; url: string }[] = [
  {
    label: "macOS",
    note: "Apple Silicon (.pkg)",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-ARM.pkg",
  },
  {
    label: "macOS",
    note: "Intel (.pkg)",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-Mac-Intel.pkg",
  },
  {
    label: "Windows",
    note: "x86_64 (.exe)",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-windows-x86_64.exe",
  },
  {
    label: "Linux",
    note: "Debian, Ubuntu (.deb)",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.deb",
  },
  {
    label: "Linux",
    note: "Fedora, openSUSE (.rpm)",
    url: "https://github.com/tmoroney/auto-subs/releases/latest/download/AutoSubs-linux-x86_64.rpm",
  },
];

export const homebrewCommand = "brew install --cask auto-subs";
