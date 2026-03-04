import { useState } from "react";
import { Circle } from "lucide-react";
import { MarkReadyForReview } from "../../../../wailsjs/go/services/PullRequestService";

export function DetailReadyForReviewButton({
  prNodeId,
  onReady,
}: {
  prNodeId: string;
  onReady?: () => void;
}) {
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReady = async () => {
    setIsMarking(true);
    setError(null);
    try {
      await MarkReadyForReview(prNodeId);
      onReady?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleReady}
        disabled={isMarking}
        title="Mark this draft PR as ready for review"
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-transparent px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-600/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-300"
      >
        <Circle className={`h-4 w-4 ${isMarking ? "animate-pulse" : ""}`} />
        {isMarking ? "Marking ready..." : "Ready for Review"}
      </button>
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
