import { useState } from "react";
import { GitMerge, CheckCircle } from "lucide-react";
import { usePRStore } from "@/stores/prStore";

interface MergeButtonProps {
  prNodeId: string;
  mergeable: string;
  state: string;
  isDraft: boolean;
  isInMergeQueue?: boolean;
  onMerged?: () => void;
}

export function MergeButton({
  prNodeId,
  mergeable,
  state,
  isDraft,
  isInMergeQueue,
  onMerged,
}: MergeButtonProps) {
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const mergePR = usePRStore((s) => s.mergePR);

  const canMerge =
    state === "OPEN" && !isDraft && mergeable === "MERGEABLE";

  if (state !== "OPEN") return null;

  const handleMerge = async () => {
    setIsMerging(true);
    setMergeError(null);
    try {
      const result = await mergePR(prNodeId, "SQUASH");
      setMergeResult(result);
      if (result === "merged") onMerged?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMergeError(message);
    } finally {
      setIsMerging(false);
    }
  };

  // Show enqueued indicator (persistent from API or ephemeral from merge action)
  if (isInMergeQueue || mergeResult === "enqueued") {
    return (
      <span className="inline-flex items-center gap-1 rounded p-1 text-xs text-blue-600 dark:text-blue-300" title="In merge queue">
        <CheckCircle className="h-3.5 w-3.5" />
        Queued
      </span>
    );
  }

  const title = !canMerge
    ? isDraft
      ? "Cannot merge draft PRs"
      : mergeable === "CONFLICTING"
      ? "This branch has conflicts"
      : "Cannot merge this PR"
    : "Squash and merge";

  return (
    <div className="relative">
      <button
        onClick={handleMerge}
        disabled={!canMerge || isMerging}
        title={title}
        className="inline-flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:text-green-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
      >
        <GitMerge className={`h-3.5 w-3.5 ${isMerging ? "animate-pulse" : ""}`} />
      </button>

      {mergeError && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-destructive shadow-md">
          {mergeError}
        </div>
      )}
    </div>
  );
}
