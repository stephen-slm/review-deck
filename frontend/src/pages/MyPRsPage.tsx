import { useState, useEffect, useCallback } from "react";
import { usePRStore, type PageDirection } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PRTable } from "@/components/pr/PRTable";
import { LastRefreshed } from "@/components/ui/LastRefreshed";
import { RefreshCw, AlertCircle } from "lucide-react";
import { GetMyPRsPage, GetMyRecentMergedPage } from "../../wailsjs/go/services/PullRequestService";

type Tab = "open" | "merged";

export function MyPRsPage() {
  const { isAuthenticated } = useAuthStore();
  const { orgs, loadOrgs } = useSettingsStore();
  const {
    pages,
    isLoading,
    lastFetchedAt,
    error,
    fetchMyPRs,
    fetchMyRecentMerged,
    goToPageMyPRs,
    goToPageMyRecentMerged,
    setPageSize,
    fetchIfStale,
    clearError,
    appendNextPage,
  } = usePRStore();

  const [activeTab, setActiveTab] = useState<Tab>("open");

  const pgOpen = pages.myPRs;
  const pgMerged = pages.myRecentMerged;
  const loadingOpen = isLoading.myPRs;
  const loadingMerged = isLoading.myRecentMerged;
  const loading = activeTab === "open" ? loadingOpen : loadingMerged;

  const forceRefresh = useCallback(() => {
    clearError();
    for (const org of orgs) {
      if (activeTab === "open") {
        fetchMyPRs(org);
      } else {
        fetchMyRecentMerged(org);
      }
    }
  }, [orgs, activeTab, fetchMyPRs, fetchMyRecentMerged, clearError]);

  // Open tab pagination
  const handlePageChangeOpen = useCallback(
    (direction: PageDirection) => {
      for (const org of orgs) {
        goToPageMyPRs(org, direction);
      }
    },
    [orgs, goToPageMyPRs],
  );

  const handlePageSizeChangeOpen = useCallback(
    (size: number) => {
      setPageSize("myPRs", size, () => {
        for (const org of orgs) {
          return fetchMyPRs(org);
        }
        return Promise.resolve();
      });
    },
    [orgs, fetchMyPRs, setPageSize],
  );

  // Merged tab pagination
  const handlePageChangeMerged = useCallback(
    (direction: PageDirection) => {
      for (const org of orgs) {
        goToPageMyRecentMerged(org, direction);
      }
    },
    [orgs, goToPageMyRecentMerged],
  );

  const handlePageSizeChangeMerged = useCallback(
    (size: number) => {
      setPageSize("myRecentMerged", size, () => {
        for (const org of orgs) {
          return fetchMyRecentMerged(org);
        }
        return Promise.resolve();
      });
    },
    [orgs, fetchMyRecentMerged, setPageSize],
  );

  const handleFetchMoreOpen = useCallback(() => {
    const org = orgs[0];
    if (!org) return;
    appendNextPage("myPRs", (pageSize, cursor) =>
      GetMyPRsPage(org, pageSize, cursor),
    );
  }, [orgs, appendNextPage]);

  const handleFetchMoreMerged = useCallback(() => {
    const org = orgs[0];
    if (!org) return;
    appendNextPage("myRecentMerged", (pageSize, cursor) =>
      GetMyRecentMergedPage(org, 14, pageSize, cursor),
    );
  }, [orgs, appendNextPage]);

  const handleTabDirect = useCallback((index: number) => {
    const tabs: Tab[] = ["open", "merged"];
    if (index >= 0 && index < tabs.length) setActiveTab(tabs[index]);
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  // Only fetch the active tab's data; merged tab is lazy-loaded on first switch.
  useEffect(() => {
    if (!isAuthenticated || orgs.length === 0) return;
    if (activeTab === "open") {
      for (const org of orgs) {
        fetchIfStale("myPRs", () => fetchMyPRs(org));
      }
    } else {
      for (const org of orgs) {
        fetchIfStale("myRecentMerged", () => fetchMyRecentMerged(org));
      }
    }
  }, [isAuthenticated, orgs, activeTab, fetchMyPRs, fetchMyRecentMerged, fetchIfStale]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Connect your GitHub account in Settings to see your pull requests.
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
            Add a GitHub organization in Settings to start tracking pull requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Pull Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull requests you have authored.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LastRefreshed timestamp={activeTab === "open" ? lastFetchedAt.myPRs : lastFetchedAt.myRecentMerged} />
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("open")}
          className={`relative px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "open"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Open
          {pgOpen.totalCount > 0 && (
            <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-xs">
              {pgOpen.totalCount}
            </span>
          )}
          {activeTab === "open" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("merged")}
          className={`relative px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "merged"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Recently Merged
          {pgMerged.totalCount > 0 && (
            <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-xs">
              {pgMerged.totalCount}
            </span>
          )}
          {activeTab === "merged" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
          )}
        </button>
      </div>

      {activeTab === "open" ? (
        <PRTable
          data={pgOpen.items}
          isLoading={loadingOpen}
          emptyMessage="No open pull requests found."
          showMerge
          showAssignReviewer
          onRefresh={forceRefresh}
          pagination={pgOpen}
          onPageChange={handlePageChangeOpen}
          onPageSizeChange={handlePageSizeChangeOpen}
          onFetchMore={handleFetchMoreOpen}
          onTabDirect={handleTabDirect}
        />
      ) : (
        <PRTable
          data={pgMerged.items}
          isLoading={loadingMerged}
          emptyMessage="No recently merged pull requests."
          onRefresh={forceRefresh}
          pagination={pgMerged}
          onPageChange={handlePageChangeMerged}
          onPageSizeChange={handlePageSizeChangeMerged}
          onFetchMore={handleFetchMoreMerged}
          onTabDirect={handleTabDirect}
        />
      )}
    </div>
  );
}
