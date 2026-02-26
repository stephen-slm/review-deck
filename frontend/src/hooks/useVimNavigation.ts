import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { tinykeys } from "tinykeys";
import { useVimStore } from "@/stores/vimStore";

/** Routes corresponding to sidebar tabs 1-6. */
const TAB_ROUTES = [
  "/dashboard",
  "/my-prs",
  "/review-requests",
  "/reviewed",
  "/settings",
];

/** Returns true when a text input / textarea / select is focused. */
function isInputFocused(): boolean {
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * Wraps a handler so it only fires when no text input is focused.
 * Automatically calls `preventDefault` to stop the keypress from
 * propagating (e.g. typing "j" into a search field).
 */
function vim(handler: () => void) {
  return (event: KeyboardEvent) => {
    if (isInputFocused()) return;
    event.preventDefault();
    handler();
  };
}

/**
 * Global VIM-style keyboard navigation.
 * Must be mounted inside a `<BrowserRouter>` (needs `useNavigate`).
 */
export function useVimNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // Reset selection when the route changes so each page starts fresh.
  useEffect(() => {
    useVimStore.getState().resetSelection();
  }, [location.pathname]);

  useEffect(() => {
    const store = useVimStore.getState;

    const unsubscribe = tinykeys(window, {
      // ---- Global: Tab navigation (Cmd+1 through Cmd+6) ----
      "$mod+1": vim(() => navigate(TAB_ROUTES[0])),
      "$mod+2": vim(() => navigate(TAB_ROUTES[1])),
      "$mod+3": vim(() => navigate(TAB_ROUTES[2])),
      "$mod+4": vim(() => navigate(TAB_ROUTES[3])),
      "$mod+5": vim(() => navigate(TAB_ROUTES[4])),

      // ---- Page tab navigation (1-4) — only active when a page registers onTabDirect ----
      "1": vim(() => { const { onTabDirect } = store(); if (onTabDirect) onTabDirect(0); }),
      "2": vim(() => { const { onTabDirect } = store(); if (onTabDirect) onTabDirect(1); }),
      "3": vim(() => { const { onTabDirect } = store(); if (onTabDirect) onTabDirect(2); }),
      "4": vim(() => { const { onTabDirect } = store(); if (onTabDirect) onTabDirect(3); }),

      // ---- Global: Escape — exit visual/pick mode > close dropdown > blur input > go back ----
      "Escape": (event: KeyboardEvent) => {
        // 0. If in visual mode or have picks, clear selection first.
        const { visualMode, pickedIndices } = store();
        if (visualMode || pickedIndices.size > 0) {
          event.preventDefault();
          store().exitVisualMode();
          return;
        }
        // 1. If a dropdown/modal registered an escape handler, let it close first.
        const { onEscape } = store();
        if (onEscape) {
          event.preventDefault();
          onEscape();
          return;
        }
        // 2. If a text input is focused, blur it.
        if (isInputFocused()) {
          (document.activeElement as HTMLElement)?.blur();
          event.preventDefault();
          return;
        }
        // 3. Otherwise, go back.
        event.preventDefault();
        const { onGoBack } = store();
        if (onGoBack) {
          onGoBack();
        }
      },

      // ---- Global: Toggle hint bar ----
      "Shift+?": vim(() => {
        store().toggleHints();
      }),

      // ---- List navigation / scroll: j/k ----
      "j": vim(() => {
        const { onMoveDown } = store();
        if (onMoveDown) { onMoveDown(); return; }
        store().moveSelection(1);
      }),
      "k": vim(() => {
        const { onMoveUp } = store();
        if (onMoveUp) { onMoveUp(); return; }
        store().moveSelection(-1);
      }),

      // ---- List navigation: gg (top), G (bottom) ----
      "g g": vim(() => {
        const { listLength } = store();
        if (listLength > 0) store().setSelectedIndex(0);
      }),
      "Shift+g": vim(() => {
        const { listLength } = store();
        if (listLength > 0) store().setSelectedIndex(listLength - 1);
      }),

      // ---- Open selected item ----
      "Enter": vim(() => {
        const { selectedIndex, onOpen } = store();
        if (selectedIndex >= 0 && onOpen) onOpen(selectedIndex);
      }),
      "l": vim(() => {
        const { onTabNext, selectedIndex, onOpen } = store();
        if (onTabNext) { onTabNext(); return; }
        if (selectedIndex >= 0 && onOpen) onOpen(selectedIndex);
      }),

      // ---- Open in GitHub ----
      "o": vim(() => {
        const { selectedIndex, onOpenExternal } = store();
        if (onOpenExternal) onOpenExternal(selectedIndex);
      }),

      // ---- Page navigation ----
      "n": vim(() => {
        const { onNextPage } = store();
        if (onNextPage) onNextPage();
      }),
      "Shift+n": vim(() => {
        const { onPrevPage } = store();
        if (onPrevPage) onPrevPage();
      }),

      // ---- Focus search ----
      "/": vim(() => {
        const { onFocusSearch } = store();
        if (onFocusSearch) onFocusSearch();
      }),

      // ---- Refresh ----
      "r": vim(() => {
        const { onRefresh } = store();
        if (onRefresh) onRefresh();
      }),

      // ---- Go back / prev tab (h / Backspace) ----
      "h": vim(() => {
        const { onTabPrev, onGoBack } = store();
        if (onTabPrev) { onTabPrev(); return; }
        if (onGoBack) onGoBack();
      }),
      "Backspace": vim(() => {
        const { onGoBack } = store();
        if (onGoBack) onGoBack();
      }),

      // ---- PR detail actions ----
      "a": vim(() => {
        const { onAssignReviewer } = store();
        if (onAssignReviewer) onAssignReviewer();
      }),
      "m": vim(() => {
        const { onMerge } = store();
        if (onMerge) onMerge();
      }),
      "Shift+A": vim(() => {
        const { onApprove } = store();
        if (onApprove) onApprove();
      }),

      // ---- Visual selection mode (v) ----
      "v": vim(() => {
        store().toggleVisualMode();
      }),

      // ---- Toggle pick / space override (Space) ----
      "Space": vim(() => {
        const { onSpace } = store();
        if (onSpace) { onSpace(); return; }
        store().togglePick();
      }),

      // ---- Copy selected PRs (c) ----
      "c": vim(() => {
        const { onCopy } = store();
        if (onCopy) onCopy();
      }),

      // ---- Hide/dismiss PR (x) ----
      "x": vim(() => {
        const { selectedIndex, onHide } = store();
        if (onHide && selectedIndex >= 0) onHide(selectedIndex);
      }),

      // ---- Toggle draft visibility (t) ----
      "t": vim(() => {
        const { onToggleDrafts } = store();
        if (onToggleDrafts) onToggleDrafts();
      }),

      // ---- Toggle stacked PR visibility (s) ----
      "s": vim(() => {
        const { onToggleStacked } = store();
        if (onToggleStacked) onToggleStacked();
      }),

      // ---- Smooth scroll: Shift+J (down) / Shift+K (up) ----
      "Shift+j": vim(() => {
        document.getElementById("scroll-region")?.scrollBy({ top: 150, behavior: "smooth" });
      }),
      "Shift+k": vim(() => {
        document.getElementById("scroll-region")?.scrollBy({ top: -150, behavior: "smooth" });
      }),
    });

    return unsubscribe;
  }, [navigate]);
}
