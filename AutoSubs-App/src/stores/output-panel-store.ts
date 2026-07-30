import { create } from "zustand";

/**
 * Section of the output sheet to reveal when it is opened from elsewhere in
 * the app (the caption-style button in the transcription header, the
 * completion card, or an invalid-config recovery click).
 */
export type OutputSection = "track" | "style" | "speakers";

/** Keep in sync with the sheet's enter/exit animation duration. */
export const OUTPUT_SHEET_ANIMATION_MS = 200;

interface OutputPanelStore {
  /**
   * Whether the output sheet occupies the transcript region. Stays true for
   * the duration of the exit animation so the transcript doesn't reappear
   * underneath the sheet while it is still sliding away.
   */
  expanded: boolean;
  /** True while the sheet is playing its exit animation. */
  closing: boolean;
  /** Section to scroll into view once the sheet renders. */
  focusSection: OutputSection | null;

  /**
   * Opens the sheet. The sheet lives inside the subtitle viewer, so callers
   * outside it must also open the viewer (via `onViewSubtitles`) for this to
   * become visible.
   */
  open: (section?: OutputSection) => void;
  /** Starts the exit animation; `finishClose` completes the teardown. */
  requestClose: () => void;
  /** Called once the exit animation has run. */
  finishClose: () => void;
  /** Collapses with no animation — for unmount, where none can play. */
  reset: () => void;
  toggle: () => void;
  clearFocusSection: () => void;
}

export const useOutputPanelStore = create<OutputPanelStore>((set, get) => ({
  expanded: false,
  closing: false,
  focusSection: null,

  open: (section) =>
    set({ expanded: true, closing: false, focusSection: section ?? null }),

  requestClose: () => {
    if (!get().expanded || get().closing) return;
    set({ closing: true, focusSection: null });
  },

  finishClose: () => set({ expanded: false, closing: false }),

  reset: () => set({ expanded: false, closing: false, focusSection: null }),

  toggle: () => {
    const { expanded, closing } = get();
    if (expanded && !closing) get().requestClose();
    else get().open();
  },

  clearFocusSection: () => set({ focusSection: null }),
}));
