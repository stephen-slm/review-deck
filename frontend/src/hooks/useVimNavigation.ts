import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { tinykeys } from "tinykeys";
import { useVimStore, getActions } from "@/stores/vimStore";
import { dlog } from "@/lib/debugLog";

/** Routes corresponding to sidebar tabs 1-5. */
const TAB_ROUTES = [
  "/my-prs",
  "/review-requests",
  "/reviewed",
  "/flagged",
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
  // Deferred via setTimeout(0) to move the Zustand set() out of React's
  // commit phase — synchronous store mutations during commit count toward
  // React's 50-update nested limit (error #185).
  // NOTE: resetSelection() intentionally does NOT reset listLength — that
  // is owned by the mounted list component (PRTable, etc.) via setListLength().
  useEffect(() => {
    dlog("vimNav:effect", `resetSelection (deferred) for path=${location.pathname}`);
    const id = setTimeout(() => {
      dlog("vimNav:reset", `fire resetSelection for path=${location.pathname}`);
      useVimStore.getState().resetSelection();
    }, 0);
    return () => clearTimeout(id);
  }, [location.pathname]);

  useEffect(() => {
    const store = useVimStore.getState;

    const unsubscribe = tinykeys(window, {
      // ---- Global: Command palette (Cmd+K) ----
      "$mod+k": (event: KeyboardEvent) => {
        event.preventDefault();
        useVimStore.getState().toggleCommandPalette();
      },

      // ---- Global: Repo selector (Cmd+0) ----
      "$mod+0": vim(() => window.dispatchEvent(new Event("repo-selector:toggle"))),

      // ---- Global: Tab navigation (Cmd+1 through Cmd+5) ----
      "$mod+1": vim(() => navigate(TAB_ROUTES[0])),
      "$mod+2": vim(() => navigate(TAB_ROUTES[1])),
      "$mod+3": vim(() => navigate(TAB_ROUTES[2])),
      "$mod+4": vim(() => navigate(TAB_ROUTES[3])),
      "$mod+5": vim(() => navigate(TAB_ROUTES[4])),

      // ---- Page tab navigation (1-5) — only active when a page registers onTabDirect ----
      "1": vim(() => { const { onTabDirect } = getActions(); if (onTabDirect) onTabDirect(0); }),
      "2": vim(() => { const { onTabDirect } = getActions(); if (onTabDirect) onTabDirect(1); }),
      "3": vim(() => { const { onTabDirect } = getActions(); if (onTabDirect) onTabDirect(2); }),
      "4": vim(() => { const { onTabDirect } = getActions(); if (onTabDirect) onTabDirect(3); }),
      "5": vim(() => { const { onTabDirect } = getActions(); if (onTabDirect) onTabDirect(4); }),
      "6": vim(() => { const { onTabDirect } = getActions(); if (onTabDirect) onTabDirect(5); }),
      "7": vim(() => { const { onTabDirect } = getActions(); if (onTabDirect) onTabDirect(6); }),

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
        const { onEscape } = getActions();
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
        const { onGoBack } = getActions();
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
        const { onMoveDown } = getActions();
        if (onMoveDown) { onMoveDown(); return; }
        store().moveSelection(1);
      }),
      "k": vim(() => {
        const { onMoveUp } = getActions();
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

      // ---- AI generation shortcuts ----
      "Shift+d": vim(() => {
        const { onGenerate } = getActions();
        if (onGenerate) onGenerate();
      }),
      "Shift+h": vim(() => {
        const { onGenerateTitle } = getActions();
        if (onGenerateTitle) onGenerateTitle();
      }),
      "Shift+e": vim(() => {
        const { onGenerateReview } = getActions();
        if (onGenerateReview) onGenerateReview();
      }),

      // ---- Open selected item ----
      "Enter": vim(() => {
        const { selectedIndex } = store();
        const { onOpen } = getActions();
        if (selectedIndex >= 0 && onOpen) onOpen(selectedIndex);
      }),
      "l": vim(() => {
        const { onTabNext, onOpen } = getActions();
        const { selectedIndex } = store();
        if (onTabNext) { onTabNext(); return; }
        if (selectedIndex >= 0 && onOpen) onOpen(selectedIndex);
      }),

      // ---- Open in GitHub ----
      "o": vim(() => {
        const { selectedIndex } = store();
        const { onOpenExternal } = getActions();
        if (onOpenExternal) onOpenExternal(selectedIndex);
      }),

      // ---- Page navigation ----
      "n": vim(() => {
        const { onNextPage } = getActions();
        if (onNextPage) onNextPage();
      }),
      "Shift+n": vim(() => {
        const { onPrevPage } = getActions();
        if (onPrevPage) onPrevPage();
      }),

      // ---- Focus search ----
      "/": vim(() => {
        const { onFocusSearch } = getActions();
        if (onFocusSearch) onFocusSearch();
      }),

      // ---- Refresh (Shift+R) ----
      "Shift+r": vim(() => {
        const { onRefresh } = getActions();
        if (onRefresh) onRefresh();
      }),

      // ---- Resolve / unresolve comment thread (r / u) ----
      "r": vim(() => {
        const { onResolve } = getActions();
        if (onResolve) onResolve();
      }),
      "u": vim(() => {
        const { onUnresolve } = getActions();
        if (onUnresolve) onUnresolve();
      }),

      // ---- Go back / prev tab (h / Backspace) ----
      "h": vim(() => {
        const { onTabPrev, onGoBack } = getActions();
        if (onTabPrev) { onTabPrev(); return; }
        if (onGoBack) onGoBack();
      }),
      "Backspace": vim(() => {
        const { onGoBack } = getActions();
        if (onGoBack) onGoBack();
      }),

      // ---- PR detail actions ----
      "a": vim(() => {
        const { onAssignReviewer } = getActions();
        if (onAssignReviewer) onAssignReviewer();
      }),
      "b": vim(() => {
        const { onAssignLabel } = getActions();
        if (onAssignLabel) onAssignLabel();
      }),
      "m": vim(() => {
        const { onMerge } = getActions();
        if (onMerge) onMerge();
      }),
      "Shift+A": vim(() => {
        const { onApprove } = getActions();
        if (onApprove) onApprove();
      }),

      // ---- Request changes on PR (d) ----
      "d": vim(() => {
        const { onRequestChanges } = getActions();
        if (onRequestChanges) onRequestChanges();
      }),

      // ---- Visual selection mode (v) ----
      "v": vim(() => {
        store().toggleVisualMode();
      }),

      // ---- Toggle pick / space override (Space) ----
      "Space": vim(() => {
        const { onSpace } = getActions();
        if (onSpace) { onSpace(); return; }
        store().togglePick();
      }),

      // ---- Copy selected PRs (c) ----
      "c": vim(() => {
        const { onCopy } = getActions();
        if (onCopy) onCopy();
      }),

      // ---- Hide/dismiss PR (x) ----
      "x": vim(() => {
        const { selectedIndex } = store();
        const { onHide } = getActions();
        if (onHide && selectedIndex >= 0) onHide(selectedIndex);
      }),

      // ---- Toggle draft visibility (t) ----
      "t": vim(() => {
        const { onToggleDrafts } = getActions();
        if (onToggleDrafts) onToggleDrafts();
      }),

      // ---- Toggle stacked PR visibility (s) ----
      "s": vim(() => {
        const { onToggleStacked } = getActions();
        if (onToggleStacked) onToggleStacked();
      }),

      // ---- Toggle "approved by me" visibility (f) ----
      "f": vim(() => {
        const { onToggleApproved } = getActions();
        if (onToggleApproved) onToggleApproved();
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
