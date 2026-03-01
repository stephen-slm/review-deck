import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useVimStore } from "@/stores/vimStore";

interface Hint {
  keys: string;
  label: string;
}

interface HintGroup {
  title: string;
  hints: Hint[];
}

const GLOBAL_HINTS: Hint[] = [
  { keys: "\u2318+1-5", label: "switch sidebar tabs" },
  { keys: "Shift+J/K", label: "smooth scroll" },
  { keys: "?", label: "toggle this popup" },
];

const LIST_HINTS: Hint[] = [
  { keys: "j/k", label: "navigate rows" },
  { keys: "Enter/l", label: "open PR" },
  { keys: "o", label: "open in GitHub" },
  { keys: "/", label: "focus search" },
  { keys: "gg/G", label: "jump to top/bottom" },
  { keys: "n/N", label: "next/prev page" },
  { keys: "R", label: "refresh" },
  { keys: "v", label: "visual select" },
  { keys: "Space", label: "toggle pick" },
  { keys: "c", label: "copy selection" },
  { keys: "t", label: "toggle drafts" },
  { keys: "s", label: "toggle stacked" },
  { keys: "f", label: "toggle approved" },
];

const REVIEW_REQUEST_HINTS: Hint[] = [
  { keys: "x", label: "hide review request" },
];

const DETAIL_HINTS: Hint[] = [
  { keys: "1-6", label: "switch tab" },
  { keys: "h/l", label: "prev/next tab" },
  { keys: "j/k", label: "scroll / navigate items" },
  { keys: "Space", label: "toggle expand file" },
  { keys: "Enter", label: "open / generate" },
  { keys: "G", label: "generate AI review / description" },
  { keys: "H", label: "generate AI title" },
  { keys: "gg", label: "jump to top" },
  { keys: "Backspace", label: "go back" },
  { keys: "R", label: "refresh" },
  { keys: "r", label: "resolve thread" },
  { keys: "u", label: "unresolve thread" },
  { keys: "o", label: "open in GitHub" },
  { keys: "a", label: "assign reviewer" },
  { keys: "m", label: "merge" },
  { keys: "A", label: "approve" },
  { keys: "d", label: "request changes" },
];

const SETTINGS_HINTS: Hint[] = [
  { keys: "j/k", label: "scroll page" },
  { keys: "h/l", label: "prev/next tab" },
  { keys: "1-3", label: "switch settings tab" },
];

function getHintGroupsForPath(pathname: string): HintGroup[] {
  if (pathname.startsWith("/pr/")) {
    return [
      { title: "PR Detail", hints: DETAIL_HINTS },
      { title: "Global", hints: GLOBAL_HINTS },
    ];
  }
  if (pathname === "/review-requests") {
    return [
      { title: "List Navigation", hints: LIST_HINTS },
      { title: "Review Requests", hints: REVIEW_REQUEST_HINTS },
      { title: "Global", hints: GLOBAL_HINTS },
    ];
  }
  if (pathname === "/my-prs") {
    return [
      { title: "List Navigation", hints: LIST_HINTS },
      { title: "My PRs", hints: [{ keys: "1/2", label: "Open / Recently Merged tab" }] },
      { title: "Global", hints: GLOBAL_HINTS },
    ];
  }
  if (pathname === "/reviewed") {
    return [
      { title: "List Navigation", hints: LIST_HINTS },
      { title: "Global", hints: GLOBAL_HINTS },
    ];
  }
  if (pathname === "/settings" || pathname === "/global-settings") {
    return [
      { title: "Settings", hints: SETTINGS_HINTS },
      { title: "Global", hints: GLOBAL_HINTS },
    ];
  }
  return [{ title: "Global", hints: GLOBAL_HINTS }];
}

export function ShortcutHintBar() {
  const showHints = useVimStore((s) => s.showHints);
  const toggleHints = useVimStore((s) => s.toggleHints);
  const { pathname } = useLocation();

  // Close on Escape
  useEffect(() => {
    if (!showHints) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        toggleHints();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showHints, toggleHints]);

  if (!showHints) return null;

  const groups = getHintGroupsForPath(pathname);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={toggleHints}
    >
      {/* Modal */}
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ? to close
          </kbd>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-3 space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              <div className="space-y-0.5">
                {group.hints.map((hint) => (
                  <div key={hint.keys} className="flex items-center justify-between py-0.5">
                    <span className="text-sm text-foreground">{hint.label}</span>
                    <kbd className="min-w-[3rem] rounded bg-muted px-2 py-0.5 text-center font-mono text-xs font-medium text-foreground">
                      {hint.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
