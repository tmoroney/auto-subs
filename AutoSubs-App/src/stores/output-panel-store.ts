import { create } from "zustand";

/**
 * Section of the output sheet to reveal when it is opened from elsewhere in
 * the app (the caption-style button in the transcription header, the
 * completion card, or an invalid-config recovery click).
 */
export type OutputSection = "track" | "style" | "speakers";

interface OutputPanelStore {
  /** Whether the output config sheet is covering the transcript. */
  expanded: boolean;
  /** Section to scroll into view once the sheet renders. */
  focusSection: OutputSection | null;

  /**
   * Opens the sheet. The sheet lives inside the subtitle viewer, so callers
   * outside it must also open the viewer (via `onViewSubtitles`) for this to
   * become visible.
   */
  open: (section?: OutputSection) => void;
  close: () => void;
  toggle: () => void;
  clearFocusSection: () => void;
}

export const useOutputPanelStore = create<OutputPanelStore>((set) => ({
  expanded: false,
  focusSection: null,

  open: (section) => set({ expanded: true, focusSection: section ?? null }),

  close: () => set({ expanded: false, focusSection: null }),

  toggle: () =>
    set((state) => ({ expanded: !state.expanded, focusSection: null })),

  clearFocusSection: () => set({ focusSection: null }),
}));
