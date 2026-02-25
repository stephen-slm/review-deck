import { useEffect, useCallback } from "react";
import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PRTable } from "@/components/pr/PRTable";
import { RefreshCw, AlertCircle } from "lucide-react";

export function ReviewRequestsPage() {
  const { isAuthenticated } = useAuthStore();
  const { orgs, loadOrgs } = useSettingsStore();
  const { reviewRequests, isLoadingReviewRequests, error, fetchReviewRequests, fetchIfStale, clearError } = usePRStore();

  const forceRefresh = useCallback(() => {
    clearError();
    for (const org of orgs) {
      fetchReviewRequests(org);
    }
  }, [orgs, fetchReviewRequests, clearError]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

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
        data={reviewRequests}
        isLoading={isLoadingReviewRequests}
        showAuthor
        emptyMessage="No pending review requests."
      />
    </div>
  );
}
