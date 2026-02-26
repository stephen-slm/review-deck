import { useEffect, useCallback } from "react";
import { usePRStore, type PageDirection } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PRTable } from "@/components/pr/PRTable";
import { LastRefreshed } from "@/components/ui/LastRefreshed";
import { RefreshCw, AlertCircle } from "lucide-react";

export function ReviewedByMePage() {
  const { isAuthenticated } = useAuthStore();
  const { orgs, loadOrgs } = useSettingsStore();
  const {
    pages,
    isLoading,
    lastFetchedAt,
    error,
    fetchReviewedByMe,
    goToPageReviewedByMe,
    setPageSize,
    fetchIfStale,
    clearError,
  } = usePRStore();

  const pg = pages.reviewedByMe;
  const loading = isLoading.reviewedByMe;

  const forceRefresh = useCallback(() => {
    clearError();
    for (const org of orgs) {
      fetchReviewedByMe(org);
    }
  }, [orgs, fetchReviewedByMe, clearError]);

  const handlePageChange = useCallback(
    (direction: PageDirection) => {
      for (const org of orgs) {
        goToPageReviewedByMe(org, direction);
      }
    },
    [orgs, goToPageReviewedByMe],
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize("reviewedByMe", size, () => {
        for (const org of orgs) {
          return fetchReviewedByMe(org);
        }
        return Promise.resolve();
      });
    },
    [orgs, fetchReviewedByMe, setPageSize],
  );

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (isAuthenticated && orgs.length > 0) {
      for (const org of orgs) {
        fetchIfStale("reviewedByMe", () => fetchReviewedByMe(org));
      }
    }
  }, [isAuthenticated, orgs, fetchReviewedByMe, fetchIfStale]);

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
          <h2 className="text-2xl font-bold tracking-tight">Reviewed by Me</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open pull requests you have reviewed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LastRefreshed timestamp={lastFetchedAt.reviewedByMe} />
          <button
            onClick={forceRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <PRTable
        data={pg.items}
        isLoading={loading}
        showAuthor
        emptyMessage="No reviewed pull requests found."
        pagination={pg}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRefresh={forceRefresh}
      />
    </div>
  );
}
