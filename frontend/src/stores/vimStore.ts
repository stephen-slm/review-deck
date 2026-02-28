import { create } from "zustand";

export interface VimState {
  /** Index of the highlighted row in the current list (-1 = nothing selected). */
  selectedIndex: number;
  /** Number of rows in the current list/table. */
  listLength: number;
  /** Whether the shortcut hint bar is visible. */
  showHints: boolean;

  /** Whether visual (multi-select) mode is active. */
  visualMode: boolean;
  /** The anchor index where visual mode was entered. */
  visualAnchor: number;
  /** Individually picked row indices (toggled via Space). */
  pickedIndices: Set<number>;

  /** Callbacks registered by the active page for context-specific actions. */
  onOpen: ((index: number) => void) | null;
  onOpenExternal: ((index: number) => void) | null;
  onRefresh: (() => void) | null;
  onNextPage: (() => void) | null;
  onPrevPage: (() => void) | null;
  onFocusSearch: (() => void) | null;
  onGoBack: (() => void) | null;
  /** Override j/k default moveSelection (e.g. page scroll on description tab). */
  onMoveDown: (() => void) | null;
  onMoveUp: (() => void) | null;
  /** Override h/l to cycle tabs instead of back/open (used on detail page). */
  onTabNext: (() => void) | null;
  onTabPrev: (() => void) | null;
  /** PR detail actions triggered by keyboard shortcuts. */
  onAssignReviewer: (() => void) | null;
  onMerge: (() => void) | null;
  onApprove: (() => void) | null;
  /** Copy selected PRs — called by 'c' keybinding. */
  onCopy: (() => void) | null;
  /** Hide/dismiss PR at index — called by 'x' keybinding. */
  onHide: ((index: number) => void) | null;
  /** Space override — used by files tab to toggle expand/collapse. Falls back to togglePick. */
  onSpace: (() => void) | null;
  /** Direct tab selection by number (1-based). Used on detail page for 1-4. */
  onTabDirect: ((index: number) => void) | null;
  /** Toggle draft PR visibility — called by 't' keybinding. */
  onToggleDrafts: (() => void) | null;
  /** Toggle stacked PR visibility — called by 's' keybinding. */
  onToggleStacked: (() => void) | null;
  /** Toggle "approved by me" PR visibility — called by 'f' keybinding. */
  onToggleApproved: (() => void) | null;
  /** Resolve selected comment thread — called by 'r' keybinding. */
  onResolve: (() => void) | null;
  /** Unresolve selected comment thread — called by 'u' keybinding. */
  onUnresolve: (() => void) | null;
  /** Request changes on a PR — called by 'd' keybinding. */
  onRequestChanges: (() => void) | null;
  /** Generate AI content (description or review) — called by 'G' (Shift+g) keybinding. */
  onGenerate: (() => void) | null;
  /**
   * Escape override — set by open dropdowns/modals to close themselves
   * instead of navigating back. Components set this directly via setState.
   */
  onEscape: (() => void) | null;

  // ---- Actions ----
  setSelectedIndex: (i: number) => void;
  setListLength: (n: number) => void;
  moveSelection: (delta: number) => void;
  resetSelection: () => void;
  toggleHints: () => void;
  toggleVisualMode: () => void;
  exitVisualMode: () => void;
  /** Get the range of indices currently selected in visual mode. */
  getVisualRange: () => [number, number] | null;
  /** Toggle the current cursor row in/out of the picked set. */
  togglePick: () => void;
  /** Clear all individually picked rows. */
  clearPicks: () => void;
  /** Get all selected indices (union of visual range + picked). Sorted ascending. */
  getAllSelectedIndices: () => number[];

  /** Pages call this to register their context-specific handlers. */
  registerActions: (actions: Partial<Pick<VimState,
    "onOpen" | "onOpenExternal" | "onRefresh" |
    "onNextPage" | "onPrevPage" | "onFocusSearch" | "onGoBack" |
    "onMoveDown" | "onMoveUp" | "onTabNext" | "onTabPrev" |
    "onAssignReviewer" | "onMerge" | "onApprove" | "onCopy" | "onHide" | "onSpace" | "onTabDirect" | "onToggleDrafts" | "onToggleStacked" | "onToggleApproved" | "onResolve" | "onUnresolve" | "onRequestChanges" | "onGenerate"
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
  onMoveDown: null,
  onMoveUp: null,
  onTabNext: null,
  onTabPrev: null,
  onAssignReviewer: null,
  onMerge: null,
  onApprove: null,
  onCopy: null,
  onHide: null,
  onSpace: null,
  onTabDirect: null,
  onToggleDrafts: null,
  onToggleStacked: null,
  onToggleApproved: null,
  onResolve: null,
  onUnresolve: null,
  onRequestChanges: null,
  onGenerate: null,
  onEscape: null,
};

export const useVimStore = create<VimState>((set, get) => ({
  selectedIndex: -1,
  listLength: 0,
  showHints: false,
  visualMode: false,
  visualAnchor: -1,
  pickedIndices: new Set<number>(),
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
      next = selectedIndex + delta;
      // Allow moving past the edges to deselect (-1), rather than clamping.
      if (next < 0 || next >= listLength) {
        next = -1;
      }
    }
    set({ selectedIndex: next });
  },

  resetSelection: () => set({ selectedIndex: -1, listLength: 0, visualMode: false, visualAnchor: -1, pickedIndices: new Set<number>() }),

  toggleHints: () => set((s) => ({ showHints: !s.showHints })),

  toggleVisualMode: () => {
    const { visualMode, selectedIndex, listLength } = get();
    if (visualMode) {
      // Exit visual mode
      set({ visualMode: false, visualAnchor: -1 });
    } else {
      // Enter visual mode — anchor at current cursor position.
      // If nothing is selected yet, start at 0.
      const anchor = selectedIndex >= 0 ? selectedIndex : (listLength > 0 ? 0 : -1);
      if (anchor < 0) return; // no rows to select
      set({ visualMode: true, visualAnchor: anchor, selectedIndex: anchor });
    }
  },

  exitVisualMode: () => set({ visualMode: false, visualAnchor: -1, pickedIndices: new Set<number>() }),

  getVisualRange: () => {
    const { visualMode, visualAnchor, selectedIndex } = get();
    if (!visualMode || visualAnchor < 0 || selectedIndex < 0) return null;
    const lo = Math.min(visualAnchor, selectedIndex);
    const hi = Math.max(visualAnchor, selectedIndex);
    return [lo, hi];
  },

  togglePick: () => {
    const { selectedIndex, listLength } = get();
    if (selectedIndex < 0 || selectedIndex >= listLength) return;
    const next = new Set(get().pickedIndices);
    if (next.has(selectedIndex)) {
      next.delete(selectedIndex);
    } else {
      next.add(selectedIndex);
    }
    set({ pickedIndices: next });
  },

  clearPicks: () => set({ pickedIndices: new Set<number>() }),

  getAllSelectedIndices: () => {
    const { visualMode, visualAnchor, selectedIndex, pickedIndices } = get();
    const indices = new Set<number>(pickedIndices);
    // Merge in the visual range if active.
    if (visualMode && visualAnchor >= 0 && selectedIndex >= 0) {
      const lo = Math.min(visualAnchor, selectedIndex);
      const hi = Math.max(visualAnchor, selectedIndex);
      for (let i = lo; i <= hi; i++) indices.add(i);
    }
    return Array.from(indices).sort((a, b) => a - b);
  },

  registerActions: (actions) => set(actions),
  clearActions: () => set(emptyActions),
}));
