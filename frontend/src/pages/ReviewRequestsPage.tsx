import { useEffect, useCallback, useMemo } from "react";
import { usePRStore, type PageDirection, type PaginationState } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useRepoStore } from "@/stores/repoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PRTable } from "@/components/pr/PRTable";
import { LastRefreshed } from "@/components/ui/LastRefreshed";
import { RefreshCw, AlertCircle, FolderGit2 } from "lucide-react";
import { github } from "../../wailsjs/go/models";
import { useFlagStore } from "@/stores/flagStore";
import { GetReviewRequestsForRepoPage } from "../../wailsjs/go/services/PullRequestService";

export function ReviewRequestsPage() {
  const { isAuthenticated } = useAuthStore();
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const isFlagged = useFlagStore((s) => s.isFlagged);
  const flagRules = useFlagStore((s) => s.rules);
  const { loadAllPriorities, getPriorityNames } = useSettingsStore();
  const {
    pages,
    isLoading,
    lastFetchedAt,
    error,
    setPageSize,
    clearError,
    hiddenPRs,
    hidePR,
    appendNextPage,
  } = usePRStore();

  const pg = pages.reviewRequests;
  const loading = isLoading.reviewRequests;

  const owner = selectedRepo?.repoOwner ?? "";
  const repo = selectedRepo?.repoName ?? "";

  // --- Fetch helper ---
  const fetchPage = useCallback(
    async (pageSize: number, cursor: string) => {
      if (!owner || !repo) return;
      const page = await GetReviewRequestsForRepoPage(owner, repo, pageSize, cursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      usePRStore.setState((s) => ({
        pages: {
          ...s.pages,
          reviewRequests: {
            ...s.pages.reviewRequests,
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
        isLoading: { ...s.isLoading, reviewRequests: false },
        lastFetchedAt: { ...s.lastFetchedAt, reviewRequests: now },
      }));
    },
    [owner, repo],
  );

  const forceRefresh = useCallback(() => {
    if (!owner || !repo) return;
    clearError();
    usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true } }));
    fetchPage(usePRStore.getState().pages.reviewRequests.pageSize, "").catch(() =>
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: false } })),
    );
  }, [owner, repo, fetchPage, clearError]);

  const handlePageChange = useCallback(
    (direction: PageDirection) => {
      if (!owner || !repo) return;
      const pgState = usePRStore.getState().pages.reviewRequests;
      const nav = resolveNav(pgState, direction);
      if (!nav) return;
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true } }));
      GetReviewRequestsForRepoPage(owner, repo, pgState.pageSize, nav.cursor)
        .then((page) => {
          const prs = page.pullRequests || [];
          usePRStore.setState((s) => ({
            pages: {
              ...s.pages,
              reviewRequests: {
                ...s.pages.reviewRequests,
                items: prs,
                currentPage: nav.newPage,
                cursorStack: nav.newStack,
                hasNextPage: page.pageInfo.hasNextPage,
                endCursor: page.pageInfo.endCursor,
                totalCount: page.pageInfo.totalCount,
                pageCache: {
                  ...s.pages.reviewRequests.pageCache,
                  [nav.newPage]: { items: prs, pageInfo: page.pageInfo, fetchedAt: Date.now() },
                },
              },
            },
            isLoading: { ...s.isLoading, reviewRequests: false },
          }));
        })
        .catch(() =>
          usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: false } })),
        );
    },
    [owner, repo],
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize("reviewRequests", size, () => {
        if (!owner || !repo) return Promise.resolve();
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true } }));
        return fetchPage(size, "");
      });
    },
    [owner, repo, fetchPage, setPageSize],
  );

  const handleFetchMore = useCallback(() => {
    if (!owner || !repo) return;
    appendNextPage("reviewRequests", (pageSize, cursor) =>
      GetReviewRequestsForRepoPage(owner, repo, pageSize, cursor),
    );
  }, [owner, repo, appendNextPage]);

  useEffect(() => {
    loadAllPriorities();
  }, [loadAllPriorities]);

  // Build priority set and sort PRs so priority items come first.
  const priorityNames = useMemo(() => getPriorityNames(), [getPriorityNames]);

  const sortedItems = useMemo(() => {
    const items = pg.items;
    if (priorityNames.size === 0) return items;
    const isPriority = (pr: github.PullRequest) =>
      priorityNames.has(pr.author) ||
      (pr.reviewRequests || []).some((rr) => priorityNames.has(rr.reviewer));
    return [...items].sort((a, b) => {
      const aPri = isPriority(a) ? 1 : 0;
      const bPri = isPriority(b) ? 1 : 0;
      return bPri - aPri; // priority items first
    });
  }, [pg.items, priorityNames]);

  // Build set of flagged PR nodeIds for red border styling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flaggedNodeIds = useMemo(
    () => new Set(pg.items.filter((pr) => isFlagged(pr)).map((pr) => pr.nodeId)),
    [pg.items, flagRules],
  );

  // Fetch data when repo changes
  useEffect(() => {
    if (!isAuthenticated || !owner || !repo) return;
    usePRStore.getState().fetchIfStale("reviewRequests", async () => {
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true } }));
      await fetchPage(usePRStore.getState().pages.reviewRequests.pageSize, "");
    });
  }, [isAuthenticated, owner, repo, fetchPage]);

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

  if (!selectedRepo) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FolderGit2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Select a repository from the sidebar to view review requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Review Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull requests awaiting your review in{" "}
            <span className="font-medium text-foreground">{owner}/{repo}</span>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LastRefreshed timestamp={lastFetchedAt.reviewRequests} />
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
        data={sortedItems}
        isLoading={loading}
        showAuthor
        emptyMessage="No pending review requests."
        pagination={pg}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRefresh={forceRefresh}
        priorityNames={priorityNames}
        onHide={hidePR}
        hiddenPRs={hiddenPRs}
        onFetchMore={handleFetchMore}
        flaggedNodeIds={flaggedNodeIds}
      />
    </div>
  );
}

// Minimal page navigation resolver.
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
