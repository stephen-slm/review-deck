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
import {
  GetReviewRequestsForRepoPage,
  GetReviewRequestsAllReposPage,
  GetReviewedByMeForRepoPage,
  GetReviewedByMeAllReposPage,
} from "../../wailsjs/go/services/PullRequestService";

export function ReviewRequestsPage() {
  const { isAuthenticated, user } = useAuthStore();
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const isFlagged = useFlagStore((s) => s.isFlagged);
  const flagRules = useFlagStore((s) => s.rules);
  const { loadAllPriorities, getPriorityNames, teamsByOrg, loadAllTeams, showAllRepos, filteredReviewUsers } = useSettingsStore();
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
  const reviewedPg = pages.reviewedByMe;
  const loading = isLoading.reviewRequests || isLoading.reviewedByMe;
  const viewerLogin = user?.login;

  const owner = selectedRepo?.repoOwner ?? "";
  const repo = selectedRepo?.repoName ?? "";
  const canFetch = showAllRepos || (!!owner && !!repo);

  // --- Review Requests fetch ---
  const fetchRawReviewRequests = useCallback(
    async (pageSize: number, cursor: string) => {
      if (showAllRepos) return GetReviewRequestsAllReposPage(pageSize, cursor);
      return GetReviewRequestsForRepoPage(owner, repo, pageSize, cursor);
    },
    [owner, repo, showAllRepos],
  );

  const fetchReviewRequestsPage = useCallback(
    async (pageSize: number, cursor: string) => {
      if (!canFetch) return;
      const page = await fetchRawReviewRequests(pageSize, cursor);
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
    [canFetch, fetchRawReviewRequests],
  );

  // --- Reviewed by Me fetch ---
  const fetchRawReviewedByMe = useCallback(
    async (pageSize: number, cursor: string) => {
      if (showAllRepos) return GetReviewedByMeAllReposPage(pageSize, cursor);
      return GetReviewedByMeForRepoPage(owner, repo, pageSize, cursor);
    },
    [owner, repo, showAllRepos],
  );

  const fetchReviewedByMePage = useCallback(
    async (pageSize: number, cursor: string) => {
      if (!canFetch) return;
      const page = await fetchRawReviewedByMe(pageSize, cursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      usePRStore.setState((s) => ({
        pages: {
          ...s.pages,
          reviewedByMe: {
            ...s.pages.reviewedByMe,
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
        isLoading: { ...s.isLoading, reviewedByMe: false },
        lastFetchedAt: { ...s.lastFetchedAt, reviewedByMe: now },
      }));
    },
    [canFetch, fetchRawReviewedByMe],
  );

  // --- Merged data ---
  const mergedItems = useMemo(() => {
    const seen = new Set(pg.items.map((pr) => pr.nodeId));
    const extra = reviewedPg.items.filter(
      (pr) => !seen.has(pr.nodeId) && pr.author !== viewerLogin,
    );
    return [...pg.items, ...extra];
  }, [pg.items, reviewedPg.items, viewerLogin]);

  // --- Combined actions ---
  const forceRefresh = useCallback(() => {
    if (!canFetch) return;
    clearError();
    usePRStore.setState((s) => ({
      isLoading: { ...s.isLoading, reviewRequests: true, reviewedByMe: true },
    }));
    const rrSize = usePRStore.getState().pages.reviewRequests.pageSize;
    const rbmSize = usePRStore.getState().pages.reviewedByMe.pageSize;
    fetchReviewRequestsPage(rrSize, "").catch(() =>
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: false } })),
    );
    fetchReviewedByMePage(rbmSize, "").catch(() =>
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: false } })),
    );
  }, [canFetch, fetchReviewRequestsPage, fetchReviewedByMePage, clearError]);

  const handlePageChange = useCallback(
    (direction: PageDirection) => {
      if (!canFetch) return;
      const pgState = usePRStore.getState().pages.reviewRequests;
      const nav = resolveNav(pgState, direction);
      if (!nav) return;
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true } }));
      fetchRawReviewRequests(pgState.pageSize, nav.cursor)
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
    [canFetch, fetchRawReviewRequests],
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize("reviewRequests", size, () => {
        if (!canFetch) return Promise.resolve();
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true } }));
        return fetchReviewRequestsPage(size, "");
      });
    },
    [canFetch, fetchReviewRequestsPage, setPageSize],
  );

  const handleFetchMore = useCallback(() => {
    if (!canFetch) return;
    appendNextPage("reviewRequests", (pageSize, cursor) => fetchRawReviewRequests(pageSize, cursor));
  }, [canFetch, fetchRawReviewRequests, appendNextPage]);

  useEffect(() => {
    loadAllPriorities();
    loadAllTeams();
  }, [loadAllPriorities, loadAllTeams]);

  const viewerTeams = useMemo(
    () => (teamsByOrg[owner] || []).map((t) => ({ slug: t.teamSlug, name: t.teamName })),
    [teamsByOrg, owner],
  );

  const priorityNames = useMemo(() => getPriorityNames(), [getPriorityNames]);

  const filteredItems = useMemo(() => {
    if (filteredReviewUsers.length === 0) return mergedItems;
    const blocked = new Set(filteredReviewUsers.map((u) => u.toLowerCase()));
    return mergedItems.filter((pr) => !blocked.has((pr.author || "").toLowerCase()));
  }, [mergedItems, filteredReviewUsers]);

  const sortedItems = useMemo(() => {
    if (priorityNames.size === 0) return filteredItems;
    const isPriority = (pr: github.PullRequest) =>
      priorityNames.has(pr.author) ||
      (pr.reviewRequests || []).some((rr) => priorityNames.has(rr.reviewer));
    return [...filteredItems].sort((a, b) => {
      const aPri = isPriority(a) ? 1 : 0;
      const bPri = isPriority(b) ? 1 : 0;
      return bPri - aPri;
    });
  }, [filteredItems, priorityNames]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flaggedNodeIds = useMemo(
    () => new Set(mergedItems.filter((pr) => isFlagged(pr)).map((pr) => pr.nodeId)),
    [mergedItems, flagRules],
  );

  // Fetch both datasets when repo changes
  useEffect(() => {
    if (!isAuthenticated || !canFetch) return;
    usePRStore.getState().fetchIfStale("reviewRequests", async () => {
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true } }));
      await fetchReviewRequestsPage(usePRStore.getState().pages.reviewRequests.pageSize, "");
    }).catch(() =>
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewRequests: false } })),
    );
    usePRStore.getState().fetchIfStale("reviewedByMe", async () => {
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: true } }));
      await fetchReviewedByMePage(usePRStore.getState().pages.reviewedByMe.pageSize, "");
    }).catch(() =>
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: false } })),
    );
  }, [isAuthenticated, canFetch, owner, repo, fetchReviewRequestsPage, fetchReviewedByMePage, showAllRepos]);

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

  if (!showAllRepos && !selectedRepo) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FolderGit2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Select a repository from the sidebar to view reviews.
          </p>
        </div>
      </div>
    );
  }

  const olderTimestamp = Math.min(lastFetchedAt.reviewRequests || 0, lastFetchedAt.reviewedByMe || 0) || lastFetchedAt.reviewRequests;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reviews</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull requests requesting or with your review
            {showAllRepos ? (
              <> across <span className="font-medium text-foreground">all repositories</span></>
            ) : (
              <> in <span className="font-medium text-foreground">{`${owner}/${repo}`}</span></>
            )}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LastRefreshed timestamp={olderTimestamp} />
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
        emptyMessage="No review requests or reviewed pull requests."
        pagination={pg}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRefresh={forceRefresh}
        priorityNames={priorityNames}
        onHide={hidePR}
        hiddenPRs={hiddenPRs}
        onFetchMore={handleFetchMore}
        viewerLogin={viewerLogin}
        flaggedNodeIds={flaggedNodeIds}
        viewerTeams={viewerTeams}
        onMerge={async (nodeId) => { await usePRStore.getState().mergePR(nodeId, "SQUASH"); forceRefresh(); }}
        groupByRepo={showAllRepos}
      />
    </div>
  );
}

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
