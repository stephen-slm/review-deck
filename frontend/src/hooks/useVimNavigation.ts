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
  "/metrics",
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
      // ---- Global: Tab navigation (1-6) ----
      "1": vim(() => navigate(TAB_ROUTES[0])),
      "2": vim(() => navigate(TAB_ROUTES[1])),
      "3": vim(() => navigate(TAB_ROUTES[2])),
      "4": vim(() => navigate(TAB_ROUTES[3])),
      "5": vim(() => navigate(TAB_ROUTES[4])),
      "6": vim(() => navigate(TAB_ROUTES[5])),

      // ---- Global: Escape — blur input or go back ----
      "Escape": (event: KeyboardEvent) => {
        if (isInputFocused()) {
          (document.activeElement as HTMLElement)?.blur();
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const { onGoBack } = store();
        if (onGoBack) {
          onGoBack();
        }
      },

      // ---- Global: Toggle hint bar ----
      "Shift+/": vim(() => {
        // Shift+/ = "?" on US keyboard layout
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
    });

    return unsubscribe;
  }, [navigate]);
}
