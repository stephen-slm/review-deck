import { useState, useRef, useEffect } from "react";
import { GitMerge, ChevronDown } from "lucide-react";
import { usePRStore } from "@/stores/prStore";

interface MergeButtonProps {
  prNodeId: string;
  mergeable: string;
  state: string;
  isDraft: boolean;
  onMerged?: () => void;
}

const mergeOptions = [
  { method: "MERGE", label: "Create a merge commit" },
  { method: "SQUASH", label: "Squash and merge" },
  { method: "REBASE", label: "Rebase and merge" },
] as const;

export function MergeButton({
  prNodeId,
  mergeable,
  state,
  isDraft,
  onMerged,
}: MergeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { mergePR } = usePRStore();

  const canMerge =
    state === "OPEN" && !isDraft && mergeable === "MERGEABLE";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  if (state !== "OPEN") return null;

  const handleMerge = async (method: string) => {
    setIsMerging(true);
    setMergeError(null);
    try {
      await mergePR(prNodeId, method);
      setIsOpen(false);
      onMerged?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMergeError(message);
    } finally {
      setIsMerging(false);
    }
  };

  const title = !canMerge
    ? isDraft
      ? "Cannot merge draft PRs"
      : mergeable === "CONFLICTING"
      ? "This branch has conflicts"
      : "Cannot merge this PR"
    : "Merge this pull request";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!canMerge || isMerging}
        title={title}
        className="inline-flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:text-green-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
      >
        <GitMerge className={`h-3.5 w-3.5 ${isMerging ? "animate-pulse" : ""}`} />
        <ChevronDown className="h-2.5 w-2.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-popover shadow-md">
          <div className="p-1">
            {mergeOptions.map((opt) => (
              <button
                key={opt.method}
                onClick={() => handleMerge(opt.method)}
                disabled={isMerging}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <GitMerge className="h-3.5 w-3.5 text-green-500" />
                {opt.label}
              </button>
            ))}
          </div>
          {mergeError && (
            <div className="border-t border-border px-2 py-1.5 text-xs text-destructive">
              {mergeError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
