import { useEffect, useCallback, useMemo } from "react";
import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PRTable } from "@/components/pr/PRTable";
import { RefreshCw, AlertCircle } from "lucide-react";
import { github } from "../../wailsjs/go/models";

export function ReviewRequestsPage() {
  const { isAuthenticated } = useAuthStore();
  const { orgs, loadOrgs, loadAllPriorities, getPriorityNames } = useSettingsStore();
  const {
    reviewRequests,
    pageState,
    isLoadingReviewRequests,
    error,
    fetchReviewRequests,
    loadMoreReviewRequests,
    fetchIfStale,
    clearError,
  } = usePRStore();

  const forceRefresh = useCallback(() => {
    clearError();
    for (const org of orgs) {
      fetchReviewRequests(org);
    }
  }, [orgs, fetchReviewRequests, clearError]);

  const handleLoadMore = useCallback(() => {
    for (const org of orgs) {
      loadMoreReviewRequests(org);
    }
  }, [orgs, loadMoreReviewRequests]);

  useEffect(() => {
    loadOrgs();
    loadAllPriorities();
  }, [loadOrgs, loadAllPriorities]);

  // Build priority set and sort PRs so priority items come first.
  const priorityNames = useMemo(() => getPriorityNames(), [getPriorityNames]);

  const sortedReviewRequests = useMemo(() => {
    if (priorityNames.size === 0) return reviewRequests;
    const isPriority = (pr: github.PullRequest) =>
      priorityNames.has(pr.author) ||
      (pr.reviewRequests || []).some((rr) => priorityNames.has(rr.reviewer));
    return [...reviewRequests].sort((a, b) => {
      const aPri = isPriority(a) ? 1 : 0;
      const bPri = isPriority(b) ? 1 : 0;
      return bPri - aPri; // priority items first
    });
  }, [reviewRequests, priorityNames]);

  useEffect(() => {
    if (isAuthenticated && orgs.length > 0) {
      for (const org of orgs) {
        fetchIfStale("reviewRequests", () => fetchReviewRequests(org));
      }
    }
  }, [isAuthenticated, orgs, fetchReviewRequests, fetchIfStale]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Connect your GitHub account in Settings first.
          </p>
        </div>
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Add a GitHub organization in Settings to start tracking.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Review Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull requests awaiting your review.
          </p>
        </div>
        <button
          onClick={forceRefresh}
          disabled={isLoadingReviewRequests}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingReviewRequests ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <PRTable
        data={sortedReviewRequests}
        isLoading={isLoadingReviewRequests}
        showAuthor
        emptyMessage="No pending review requests."
        serverPageInfo={pageState.reviewRequests}
        onLoadMore={handleLoadMore}
        priorityNames={priorityNames}
      />
    </div>
  );
}
