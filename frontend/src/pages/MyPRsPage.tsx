import { useState, useEffect, useCallback } from "react";
import { usePRStore, type PageDirection } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useRepoStore } from "@/stores/repoStore";
import { PRTable } from "@/components/pr/PRTable";
import { LastRefreshed } from "@/components/ui/LastRefreshed";
import { RefreshCw, AlertCircle, FolderGit2 } from "lucide-react";
import {
  GetMyPRsForRepoPage,
  GetMyRecentMergedForRepoPage,
  GetMyPRsAllReposPage,
  GetMyRecentMergedAllReposPage,
} from "../../wailsjs/go/services/PullRequestService";

type Tab = "open" | "merged";

export function MyPRsPage() {
  const { isAuthenticated } = useAuthStore();
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const isAllRepos = useRepoStore((s) => s.isAllRepos);

  const {
    pages,
    isLoading,
    lastFetchedAt,
    error,
    setPageSize,
    clearError,
    appendNextPage,
  } = usePRStore();

  const [activeTab, setActiveTab] = useState<Tab>("open");

  const pgOpen = pages.myPRs;
  const pgMerged = pages.myRecentMerged;
  const loadingOpen = isLoading.myPRs;
  const loadingMerged = isLoading.myRecentMerged;
  const loading = activeTab === "open" ? loadingOpen : loadingMerged;

  const owner = selectedRepo?.repoOwner ?? "";
  const repo = selectedRepo?.repoName ?? "";

  // Whether we have a valid fetch target (either a specific repo or all-repos mode).
  const canFetch = isAllRepos || (!!owner && !!repo);

  // --- Unified fetch helpers that dispatch to repo-scoped or all-repos endpoints ---

  const fetchOpenRaw = useCallback(
    async (pageSize: number, cursor: string) => {
      if (isAllRepos) {
        return GetMyPRsAllReposPage(pageSize, cursor);
      }
      return GetMyPRsForRepoPage(owner, repo, pageSize, cursor);
    },
    [isAllRepos, owner, repo],
  );

  const fetchMergedRaw = useCallback(
    async (pageSize: number, cursor: string) => {
      if (isAllRepos) {
        return GetMyRecentMergedAllReposPage(14, pageSize, cursor);
      }
      return GetMyRecentMergedForRepoPage(owner, repo, 14, pageSize, cursor);
    },
    [isAllRepos, owner, repo],
  );

  const fetchOpenPage = useCallback(
    async (pageSize: number, cursor: string) => {
      if (!canFetch) return;
      const page = await fetchOpenRaw(pageSize, cursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      usePRStore.setState((s) => ({
        pages: {
          ...s.pages,
          myPRs: {
            ...s.pages.myPRs,
            items: prs,
            currentPage: 1,
            hasNextPage: info.hasNextPage,
            endCursor: info.endCursor,
            totalCount: info.totalCount,
            cursorStack: [""],
            pageCache: {
              1: { items: prs, pageInfo: info, fetchedAt: now },
            },
          },
        },
        isLoading: { ...s.isLoading, myPRs: false },
        lastFetchedAt: { ...s.lastFetchedAt, myPRs: now },
      }));
    },
    [canFetch, fetchOpenRaw],
  );

  const fetchMergedPage = useCallback(
    async (pageSize: number, cursor: string) => {
      if (!canFetch) return;
      const page = await fetchMergedRaw(pageSize, cursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      usePRStore.setState((s) => ({
        pages: {
          ...s.pages,
          myRecentMerged: {
            ...s.pages.myRecentMerged,
            items: prs,
            currentPage: 1,
            hasNextPage: info.hasNextPage,
            endCursor: info.endCursor,
            totalCount: info.totalCount,
            cursorStack: [""],
            pageCache: {
              1: { items: prs, pageInfo: info, fetchedAt: now },
            },
          },
        },
        isLoading: { ...s.isLoading, myRecentMerged: false },
        lastFetchedAt: { ...s.lastFetchedAt, myRecentMerged: now },
      }));
    },
    [canFetch, fetchMergedRaw],
  );

  const forceRefresh = useCallback(() => {
    if (!canFetch) return;
    clearError();
    const ps = usePRStore.getState().pages;
    if (activeTab === "open") {
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myPRs: true } }));
      fetchOpenPage(ps.myPRs.pageSize, "").catch(() =>
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myPRs: false } })),
      );
    } else {
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: true } }));
      fetchMergedPage(ps.myRecentMerged.pageSize, "").catch(() =>
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: false } })),
      );
    }
  }, [canFetch, activeTab, fetchOpenPage, fetchMergedPage, clearError]);

  // Open tab pagination
  const handlePageChangeOpen = useCallback(
    (direction: PageDirection) => {
      if (!canFetch) return;
      const pg = usePRStore.getState().pages.myPRs;
      const nav = resolveNav(pg, direction);
      if (!nav) return;
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myPRs: true } }));
      fetchOpenRaw(pg.pageSize, nav.cursor)
        .then((page) => {
          const prs = page.pullRequests || [];
          usePRStore.setState((s) => ({
            pages: {
              ...s.pages,
              myPRs: {
                ...s.pages.myPRs,
                items: prs,
                currentPage: nav.newPage,
                cursorStack: nav.newStack,
                hasNextPage: page.pageInfo.hasNextPage,
                endCursor: page.pageInfo.endCursor,
                totalCount: page.pageInfo.totalCount,
                pageCache: {
                  ...s.pages.myPRs.pageCache,
                  [nav.newPage]: { items: prs, pageInfo: page.pageInfo, fetchedAt: Date.now() },
                },
              },
            },
            isLoading: { ...s.isLoading, myPRs: false },
          }));
        })
        .catch(() =>
          usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myPRs: false } })),
        );
    },
    [canFetch, fetchOpenRaw],
  );

  const handlePageSizeChangeOpen = useCallback(
    (size: number) => {
      setPageSize("myPRs", size, () => {
        if (!canFetch) return Promise.resolve();
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myPRs: true } }));
        return fetchOpenPage(size, "");
      });
    },
    [canFetch, fetchOpenPage, setPageSize],
  );

  // Merged tab pagination
  const handlePageChangeMerged = useCallback(
    (direction: PageDirection) => {
      if (!canFetch) return;
      const pg = usePRStore.getState().pages.myRecentMerged;
      const nav = resolveNav(pg, direction);
      if (!nav) return;
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: true } }));
      fetchMergedRaw(pg.pageSize, nav.cursor)
        .then((page) => {
          const prs = page.pullRequests || [];
          usePRStore.setState((s) => ({
            pages: {
              ...s.pages,
              myRecentMerged: {
                ...s.pages.myRecentMerged,
                items: prs,
                currentPage: nav.newPage,
                cursorStack: nav.newStack,
                hasNextPage: page.pageInfo.hasNextPage,
                endCursor: page.pageInfo.endCursor,
                totalCount: page.pageInfo.totalCount,
                pageCache: {
                  ...s.pages.myRecentMerged.pageCache,
                  [nav.newPage]: { items: prs, pageInfo: page.pageInfo, fetchedAt: Date.now() },
                },
              },
            },
            isLoading: { ...s.isLoading, myRecentMerged: false },
          }));
        })
        .catch(() =>
          usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: false } })),
        );
    },
    [canFetch, fetchMergedRaw],
  );

  const handlePageSizeChangeMerged = useCallback(
    (size: number) => {
      setPageSize("myRecentMerged", size, () => {
        if (!canFetch) return Promise.resolve();
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: true } }));
        return fetchMergedPage(size, "");
      });
    },
    [canFetch, fetchMergedPage, setPageSize],
  );

  const handleFetchMoreOpen = useCallback(() => {
    if (!canFetch) return;
    appendNextPage("myPRs", (pageSize, cursor) => fetchOpenRaw(pageSize, cursor));
  }, [canFetch, fetchOpenRaw, appendNextPage]);

  const handleFetchMoreMerged = useCallback(() => {
    if (!canFetch) return;
    appendNextPage("myRecentMerged", (pageSize, cursor) => fetchMergedRaw(pageSize, cursor));
  }, [canFetch, fetchMergedRaw, appendNextPage]);

  const handleTabDirect = useCallback((index: number) => {
    const tabs: Tab[] = ["open", "merged"];
    if (index >= 0 && index < tabs.length) setActiveTab(tabs[index]);
  }, []);

  // Fetch data when repo changes or tab switches
  useEffect(() => {
    if (!isAuthenticated || !canFetch) return;
    if (activeTab === "open") {
      usePRStore.getState().fetchIfStale("myPRs", async () => {
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myPRs: true } }));
        await fetchOpenPage(usePRStore.getState().pages.myPRs.pageSize, "");
      });
    } else {
      usePRStore.getState().fetchIfStale("myRecentMerged", async () => {
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: true } }));
        await fetchMergedPage(usePRStore.getState().pages.myRecentMerged.pageSize, "");
      });
    }
  }, [isAuthenticated, canFetch, isAllRepos, owner, repo, activeTab, fetchOpenPage, fetchMergedPage]);

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

  if (!selectedRepo && !isAllRepos) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FolderGit2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Select a repository from the sidebar to view pull requests.
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
            Pull requests you have authored in{" "}
            <span className="font-medium text-foreground">
              {isAllRepos ? "all tracked repos" : `${owner}/${repo}`}
            </span>.
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
          <kbd className="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">
            1
          </kbd>
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
          <kbd className="ml-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">
            2
          </kbd>
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
          timestampField="mergedAt"
        />
      )}
    </div>
  );
}

// Minimal page navigation resolver (same logic as prStore's internal resolveNavigation).
import type { PaginationState } from "@/stores/prStore";

function resolveNav(
  pg: PaginationState,
  direction: PageDirection,
): { cursor: string; newPage: number; newStack: string[] } | null {
  switch (direction) {
    case "first":
      return { cursor: "", newPage: 1, newStack: [""] };
    case "next": {
      if (!pg.hasNextPage) return null;
      const newStack = [...pg.cursorStack, pg.endCursor];
      return { cursor: pg.endCursor, newPage: pg.currentPage + 1, newStack };
    }
    case "prev": {
      if (pg.currentPage <= 1) return null;
      const newStack = pg.cursorStack.slice(0, -1);
      const cursor = newStack[newStack.length - 1] ?? "";
      return { cursor, newPage: pg.currentPage - 1, newStack };
    }
  }
}
