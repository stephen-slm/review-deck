import { create } from "zustand";

export interface VimState {
  /** Index of the highlighted row in the current list (-1 = nothing selected). */
  selectedIndex: number;
  /** Number of rows in the current list/table. */
  listLength: number;
  /** Whether the shortcut hint bar is visible. */
  showHints: boolean;

  /** Callbacks registered by the active page for context-specific actions. */
  onOpen: ((index: number) => void) | null;
  onOpenExternal: ((index: number) => void) | null;
  onRefresh: (() => void) | null;
  onNextPage: (() => void) | null;
  onPrevPage: (() => void) | null;
  onFocusSearch: (() => void) | null;
  onGoBack: (() => void) | null;

  // ---- Actions ----
  setSelectedIndex: (i: number) => void;
  setListLength: (n: number) => void;
  moveSelection: (delta: number) => void;
  resetSelection: () => void;
  toggleHints: () => void;

  /** Pages call this to register their context-specific handlers. */
  registerActions: (actions: Partial<Pick<VimState,
    "onOpen" | "onOpenExternal" | "onRefresh" |
    "onNextPage" | "onPrevPage" | "onFocusSearch" | "onGoBack"
  >>) => void;
  /** Clear all registered actions (called on unmount / route change). */
  clearActions: () => void;
}

const emptyActions = {
  onOpen: null,
  onOpenExternal: null,
  onRefresh: null,
  onNextPage: null,
  onPrevPage: null,
  onFocusSearch: null,
  onGoBack: null,
};

export const useVimStore = create<VimState>((set, get) => ({
  selectedIndex: -1,
  listLength: 0,
  showHints: true,
  ...emptyActions,

  setSelectedIndex: (i) => set({ selectedIndex: i }),

  setListLength: (n) => {
    const { selectedIndex } = get();
    // Clamp selection if the list shrunk.
    if (selectedIndex >= n) {
      set({ listLength: n, selectedIndex: n > 0 ? n - 1 : -1 });
    } else {
      set({ listLength: n });
    }
  },

  moveSelection: (delta) => {
    const { selectedIndex, listLength } = get();
    if (listLength === 0) return;
    let next: number;
    if (selectedIndex === -1) {
      // Nothing selected yet — start at top or bottom depending on direction.
      next = delta > 0 ? 0 : listLength - 1;
    } else {
      next = Math.max(0, Math.min(listLength - 1, selectedIndex + delta));
    }
    set({ selectedIndex: next });
  },

  resetSelection: () => set({ selectedIndex: -1, listLength: 0, ...emptyActions }),

  toggleHints: () => set((s) => ({ showHints: !s.showHints })),

  registerActions: (actions) => set(actions),
  clearActions: () => set(emptyActions),
}));
