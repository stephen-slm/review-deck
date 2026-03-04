import { useState, useEffect, useMemo } from "react";
import { CheckCircle, ThumbsUp } from "lucide-react";
import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { github } from "../../../../wailsjs/go/models";

export function DetailApproveButton({
  prNodeId,
  reviews,
  author,
  triggerRef,
  onApproved,
}: {
  prNodeId: string;
  reviews: github.Review[] | null;
  author: string;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  onApproved?: () => void;
}) {
  const [isApproving, setIsApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approvePR = usePRStore((s) => s.approvePR);
  const viewerLogin = useAuthStore((s) => s.user?.login);

  // You cannot approve your own PR
  const isOwnPR = !!viewerLogin && viewerLogin === author;

  // Check if the viewer has already approved this PR
  const alreadyApproved = useMemo(() => {
    if (!reviews || !viewerLogin) return false;
    const viewerReviews = reviews.filter((r) => r.author === viewerLogin);
    if (viewerReviews.length === 0) return false;
    const latest = viewerReviews.reduce((a, b) => {
      const aTs = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bTs = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bTs > aTs ? b : a;
    });
    return latest.state === "APPROVED";
  }, [reviews, viewerLogin]);

  const handleApprove = async () => {
    setIsApproving(true);
    setError(null);
    try {
      await approvePR(prNodeId);
      setApproved(true);
      onApproved?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApproving(false);
    }
  };

  // Expose approve to parent via triggerRef.
  useEffect(() => {
    if (triggerRef) {
      triggerRef.current = () => {
        if (!isOwnPR && !alreadyApproved && !approved && !isApproving) handleApprove();
      };
    }
    return () => { if (triggerRef) triggerRef.current = null; };
  });

  if (approved || alreadyApproved) {
    return (
      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle className="h-4 w-4" />
        Approved
      </div>
    );
  }

  const disabled = isApproving || isOwnPR;
  const title = isOwnPR
    ? "You cannot approve your own pull request"
    : "Approve this pull request";

  return (
    <div>
      <button
        onClick={handleApprove}
        disabled={disabled}
        title={title}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-green-600 bg-transparent px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-600/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-green-300"
      >
        <ThumbsUp className={`h-4 w-4 ${isApproving ? "animate-pulse" : ""}`} />
        {isApproving ? "Approving..." : "Approve"}
        {!isApproving && <kbd className="ml-0.5 rounded bg-green-500/10 px-1 py-0.5 font-mono text-[10px] text-green-400/60">A</kbd>}
      </button>
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
