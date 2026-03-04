import { useState, useEffect } from "react";
import { GitMerge, CheckCircle } from "lucide-react";
import { usePRStore } from "@/stores/prStore";

export function DetailMergeButton({
  prNodeId,
  mergeable,
  reviewDecision,
  isDraft,
  isInMergeQueue,
  onMerged,
  triggerRef,
}: {
  prNodeId: string;
  mergeable: string;
  reviewDecision: string;
  isDraft: boolean;
  isInMergeQueue?: boolean;
  onMerged?: () => void;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const mergePR = usePRStore((s) => s.mergePR);

  const reviewBlocked = reviewDecision === "REVIEW_REQUIRED" || reviewDecision === "CHANGES_REQUESTED";
  const canMerge = !isDraft && !reviewBlocked && mergeable === "MERGEABLE";

  // Expose trigger to parent via triggerRef (used by vim "m" key).
  useEffect(() => {
    if (triggerRef) triggerRef.current = () => { if (canMerge) handleMerge(); };
    return () => { if (triggerRef) triggerRef.current = null; };
  });

  const handleMerge = async () => {
    setIsMerging(true);
    setMergeError(null);
    try {
      const result = await mergePR(prNodeId, "SQUASH");
      setMergeResult(result);
      onMerged?.();
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMerging(false);
    }
  };

  // Show enqueued state (persistent from API or ephemeral from merge action)
  if (isInMergeQueue || mergeResult === "enqueued") {
    return (
      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        <CheckCircle className="h-4 w-4" />
        In merge queue
      </div>
    );
  }

  const title = !canMerge
    ? isDraft
      ? "Cannot merge draft PRs"
      : reviewDecision === "CHANGES_REQUESTED"
        ? "Changes have been requested"
        : reviewDecision === "REVIEW_REQUIRED"
          ? "Review approval is required"
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
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GitMerge className={`h-4 w-4 ${isMerging ? "animate-pulse" : ""}`} />
        Squash and merge
      </button>

      {mergeError && (
        <div className="mt-1 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-destructive shadow-md">
          {mergeError}
        </div>
      )}
    </div>
  );
}
