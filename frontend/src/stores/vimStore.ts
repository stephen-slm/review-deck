import { create } from "zustand";

// ---- Action callbacks (non-reactive) ----
// These are stored outside Zustand's reactive state so that updating them
// (which happens on every render via the no-deps useEffect in page components)
// does NOT trigger store notifications or subscriber re-renders.
// The tinykeys handlers in useVimNavigation read them via getActions().

type ActionCallbacks = {
  onOpen: ((index: number) => void) | null;
  onOpenExternal: ((index: number) => void) | null;
  onRefresh: (() => void) | null;
  onNextPage: (() => void) | null;
  onPrevPage: (() => void) | null;
  onFocusSearch: (() => void) | null;
  onGoBack: (() => void) | null;
  onMoveDown: (() => void) | null;
  onMoveUp: (() => void) | null;
  onTabNext: (() => void) | null;
  onTabPrev: (() => void) | null;
  onAssignReviewer: (() => void) | null;
  onAssignLabel: (() => void) | null;
  onMerge: (() => void) | null;
  onApprove: (() => void) | null;
  onCopy: (() => void) | null;
  onHide: ((index: number) => void) | null;
  onSpace: (() => void) | null;
  onTabDirect: ((index: number) => void) | null;
  onToggleDrafts: (() => void) | null;
  onToggleStacked: (() => void) | null;
  onToggleApproved: (() => void) | null;
  onResolve: (() => void) | null;
  onUnresolve: (() => void) | null;
  onRequestChanges: (() => void) | null;
  onGenerate: (() => void) | null;
  onGenerateTitle: (() => void) | null;
  onGenerateReview: (() => void) | null;
  onEscape: (() => void) | null;
};

const emptyActions: ActionCallbacks = {
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
  onAssignLabel: null,
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
  onGenerateTitle: null,
  onGenerateReview: null,
  onEscape: null,
};

/** Mutable action callbacks — NOT part of Zustand reactive state. */
let _actions: ActionCallbacks = { ...emptyActions };

/** Read the current action callbacks (used by tinykeys handlers). */
export function getActions(): ActionCallbacks {
  return _actions;
}

/** Replace the current action callbacks (called by page useEffect hooks). */
export function registerActions(actions: Partial<ActionCallbacks>): void {
  _actions = { ...emptyActions, ...actions };
}

/** Reset all action callbacks to null. */
export function clearActions(): void {
  _actions = { ...emptyActions };
}

/** Set the escape override (used by dropdowns/modals). */
export function setEscapeAction(handler: (() => void) | null): void {
  _actions = { ..._actions, onEscape: handler };
}

// ---- Zustand store (reactive UI state only) ----

export interface VimState {
  /** Index of the highlighted row in the current list (-1 = nothing selected). */
  selectedIndex: number;
  /** Number of rows in the current list/table. */
  listLength: number;
  /** Whether the shortcut hint bar is visible. */
  showHints: boolean;
  /** Whether the command palette is visible. */
  commandPaletteOpen: boolean;

  /** Whether visual (multi-select) mode is active. */
  visualMode: boolean;
  /** The anchor index where visual mode was entered. */
  visualAnchor: number;
  /** Individually picked row indices (toggled via Space). */
  pickedIndices: Set<number>;

  // ---- Actions ----
  setSelectedIndex: (i: number) => void;
  setListLength: (n: number) => void;
  moveSelection: (delta: number) => void;
  resetSelection: () => void;
  toggleHints: () => void;
  toggleCommandPalette: () => void;
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
}

export const useVimStore = create<VimState>((set, get) => ({
  selectedIndex: -1,
  listLength: 0,
  showHints: false,
  commandPaletteOpen: false,
  visualMode: false,
  visualAnchor: -1,
  pickedIndices: new Set<number>(),

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
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

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
}));
