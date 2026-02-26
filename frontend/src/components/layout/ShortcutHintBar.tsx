import { useLocation } from "react-router-dom";
import { useVimStore } from "@/stores/vimStore";

interface Hint {
  keys: string;
  label: string;
}

const GLOBAL_HINTS: Hint[] = [
  { keys: "1-6", label: "tabs" },
  { keys: "?", label: "toggle hints" },
];

const LIST_HINTS: Hint[] = [
  { keys: "j/k", label: "navigate" },
  { keys: "Enter/l", label: "open" },
  { keys: "o", label: "GitHub" },
  { keys: "/", label: "search" },
  { keys: "gg/G", label: "top/bottom" },
  { keys: "n/N", label: "page" },
  { keys: "r", label: "refresh" },
  { keys: "v", label: "visual select" },
  { keys: "Space", label: "toggle pick" },
  { keys: "c", label: "copy" },
];

const DETAIL_HINTS: Hint[] = [
  { keys: "h/l", label: "prev/next tab" },
  { keys: "j/k", label: "scroll/navigate" },
  { keys: "Enter", label: "open" },
  { keys: "gg/G", label: "top/bottom" },
  { keys: "Backspace", label: "back" },
  { keys: "r", label: "refresh" },
  { keys: "o", label: "GitHub" },
  { keys: "a", label: "assign reviewer" },
  { keys: "m", label: "merge" },
  { keys: "A", label: "approve" },
];

const SCROLL_HINTS: Hint[] = [
  { keys: "j/k", label: "scroll" },
];

function getHintsForPath(pathname: string): Hint[] {
  // PR detail page
  if (pathname.startsWith("/pr/")) {
    return [...DETAIL_HINTS, ...GLOBAL_HINTS];
  }
  // Pages with PRTable
  if (
    pathname === "/my-prs" ||
    pathname === "/review-requests" ||
    pathname === "/reviewed"
  ) {
    return [...LIST_HINTS, ...GLOBAL_HINTS];
  }
  // Metrics and settings support j/k scrolling
  if (pathname === "/metrics" || pathname === "/settings") {
    return [...SCROLL_HINTS, ...GLOBAL_HINTS];
  }
  // Dashboard and fallback — no page-specific actions
  return GLOBAL_HINTS;
}

export function ShortcutHintBar() {
  const showHints = useVimStore((s) => s.showHints);
  const { pathname } = useLocation();

  if (!showHints) return null;

  const hints = getHintsForPath(pathname);

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card/80 px-3 py-1">
      {hints.map((hint) => (
        <span key={hint.keys} className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-medium text-foreground">
            {hint.keys}
          </kbd>
          <span>{hint.label}</span>
        </span>
      ))}
    </div>
  );
}
