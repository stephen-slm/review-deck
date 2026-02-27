import { useEffect } from "react";

/**
 * Re-focuses the webview content when the native window regains focus.
 *
 * On macOS, the WKWebView used by Wails production builds can lose
 * internal document focus when the user switches to another app and
 * comes back (Cmd+Tab). When this happens, `keydown` events are
 * dispatched to the native window layer but never reach the webview's
 * `window` object — breaking all keyboard shortcuts (vim keys, etc.).
 *
 * This hook listens for `focus` and `visibilitychange` events on
 * `window` and calls `document.body.focus()` when focus returns,
 * but only if no interactive element (input/textarea/select) is
 * already focused, so we don't steal focus from form fields.
 */
export function useWindowFocus() {
  useEffect(() => {
    function refocusBody() {
      const active = document.activeElement;
      // Only refocus if nothing meaningful has focus — the body itself
      // or null both indicate the webview content lost its focus target.
      if (!active || active === document.body || active === document.documentElement) {
        document.body.focus();
      }
    }

    function handleFocus() {
      refocusBody();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refocusBody();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
