import { useState, useEffect, useRef } from "react";
import { XCircle, ChevronDown } from "lucide-react";
import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { setEscapeAction } from "@/stores/vimStore";

export function DetailRequestChangesButton({
  prNodeId,
  author,
  triggerRef,
  onSubmitted,
}: {
  prNodeId: string;
  author: string;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  onSubmitted?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestChangesPR = usePRStore((s) => s.requestChangesPR);
  const viewerLogin = useAuthStore((s) => s.user?.login);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOwnPR = !!viewerLogin && viewerLogin === author;

  // Expose toggle to parent via triggerRef.
  useEffect(() => {
    if (triggerRef) triggerRef.current = () => { if (!isOwnPR) setIsOpen((o) => !o); };
    return () => { if (triggerRef) triggerRef.current = null; };
  });

  // Register vim escape override to close dropdown.
  useEffect(() => {
    if (isOpen) {
      setEscapeAction(() => setIsOpen(false));
      // Focus the textarea when opened.
      setTimeout(() => textareaRef.current?.focus(), 50);
      return () => setEscapeAction(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await requestChangesPR(prNodeId, body.trim());
      setBody("");
      setIsOpen(false);
      onSubmitted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const disabled = isOwnPR;
  const title = isOwnPR
    ? "You cannot request changes on your own pull request"
    : "Request changes on this pull request";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={title}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-red-600 bg-transparent px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-600/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
      >
        <XCircle className={`h-4 w-4 ${isSubmitting ? "animate-pulse" : ""}`} />
        Request Changes
        {!isOpen && <kbd className="ml-0.5 rounded bg-red-500/10 px-1 py-0.5 font-mono text-[10px] text-red-400/60">d</kbd>}
        <ChevronDown className="ml-auto h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
          <div className="p-3 space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Describe the changes needed
            </label>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter to submit
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
                // Escape — close the dropdown and stop propagation so tinykeys
                // doesn't also fire its cascade (blur → navigate back).
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(false);
                }
              }}
              placeholder="What needs to change..."
              rows={4}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Enter</kbd> to submit
              </span>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !body.trim()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </div>
          {error && (
            <div className="border-t border-border px-3 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
