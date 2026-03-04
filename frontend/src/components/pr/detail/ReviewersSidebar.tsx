import { useMemo } from "react";
import { User, Users } from "lucide-react";
import { github } from "../../../../wailsjs/go/models";
import { ReviewStateBadge } from "@/components/pr/ReviewStateBadge";
import { ReviewerAssign } from "@/components/pr/ReviewerAssign";
import { SidebarSection } from "./SidebarSection";

/**
 * Sidebar section that shows:
 * - Latest review state per unique reviewer (deduplicated, latest non-COMMENTED wins)
 * - Pending review requests that haven't submitted a review yet
 */
export function ReviewersSidebar({
  reviews,
  reviewRequests,
  prNodeId,
  isOpen,
  triggerRef,
  onAssigned,
}: {
  reviews: github.Review[] | null;
  reviewRequests: github.ReviewRequest[] | null;
  prNodeId: string;
  isOpen: boolean;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  onAssigned?: () => void;
}) {
  const latestReviews = useMemo(() => {
    if (!reviews || reviews.length === 0) return [];

    // For each author, find their latest meaningful review state.
    // Priority: APPROVED / CHANGES_REQUESTED > DISMISSED > COMMENTED > PENDING
    // If only COMMENTED reviews exist, still show them.
    const byAuthor = new Map<string, github.Review>();
    for (const r of reviews) {
      const existing = byAuthor.get(r.author);
      if (!existing) {
        byAuthor.set(r.author, r);
        continue;
      }
      // Take whichever was submitted later
      const existingTs = existing.submittedAt ? new Date(existing.submittedAt).getTime() : 0;
      const currentTs = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
      if (currentTs > existingTs) {
        byAuthor.set(r.author, r);
      }
    }
    return Array.from(byAuthor.values());
  }, [reviews]);

  // Pending requests that don't have a completed review
  const pendingRequests = useMemo(() => {
    if (!reviewRequests || reviewRequests.length === 0) return [];
    const reviewedAuthors = new Set(latestReviews.map((r) => r.author));
    return reviewRequests.filter((rr) => !reviewedAuthors.has(rr.reviewer));
  }, [reviewRequests, latestReviews]);

  const hasReviewers = latestReviews.length > 0 || pendingRequests.length > 0;

  if (!hasReviewers && !isOpen) return null;

  return (
    <SidebarSection title="Reviewers">
      <div className="space-y-1.5">
        {latestReviews.map((review) => (
          <div key={review.author} className="flex items-center gap-2">
            {review.authorAvatar ? (
              <img
                src={review.authorAvatar}
                alt={review.author}
                className="h-5 w-5 rounded-full"
              />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs">
                {review.author?.[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-sm text-foreground">{review.author}</span>
            <span className="ml-auto">
              <ReviewStateBadge state={review.state} />
            </span>
          </div>
        ))}
        {pendingRequests.map((rr, i) => (
          <div key={`pending-${i}`} className="flex items-center gap-2">
            {rr.reviewerType === "team" ? (
              <Users className="h-5 w-5 text-muted-foreground" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">{rr.reviewer}</span>
              <span className="ml-auto">
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                Pending
              </span>
              </span>
          </div>
        ))}
        {isOpen && (
          <ReviewerAssign
            prNodeId={prNodeId}
            currentReviewers={(reviewRequests || []).map((rr) => rr.reviewer)}
            triggerRef={triggerRef}
            onAssigned={onAssigned}
          />
        )}
      </div>
    </SidebarSection>
  );
}
