import { useEffect, useCallback, useMemo } from "react";
import { usePRStore, type PageDirection, type PaginationState } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useRepoStore } from "@/stores/repoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PRTable } from "@/components/pr/PRTable";
import { LastRefreshed } from "@/components/ui/LastRefreshed";
import { RefreshCw, AlertCircle, FolderGit2 } from "lucide-react";
import { useFlagStore } from "@/stores/flagStore";
import {
  GetReviewedByMeForRepoPage,
} from "../../wailsjs/go/services/PullRequestService";

export function ReviewedByMePage() {
  const { isAuthenticated, user } = useAuthStore();
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const isFlagged = useFlagStore((s) => s.isFlagged);
  const flagRules = useFlagStore((s) => s.rules);
  const { teamsByOrg, loadAllTeams } = useSettingsStore();
  const {
    pages,
    isLoading,
    lastFetchedAt,
    error,
    setPageSize,
    clearError,
    appendNextPage,
  } = usePRStore();

  const pg = pages.reviewedByMe;
  const loading = isLoading.reviewedByMe;

  const owner = selectedRepo?.repoOwner ?? "";
  const repo = selectedRepo?.repoName ?? "";
  const canFetch = !!owner && !!repo;

  const fetchRaw = useCallback(
    async (pageSize: number, cursor: string) => {
      return GetReviewedByMeForRepoPage(owner, repo, pageSize, cursor);
    },
    [owner, repo],
  );

  const fetchPage = useCallback(
    async (pageSize: number, cursor: string) => {
      if (!canFetch) return;
      const page = await fetchRaw(pageSize, cursor);
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
    [canFetch, fetchRaw],
  );

  const forceRefresh = useCallback(() => {
    if (!canFetch) return;
    clearError();
    usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: true } }));
    fetchPage(usePRStore.getState().pages.reviewedByMe.pageSize, "").catch(() =>
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: false } })),
    );
  }, [canFetch, fetchPage, clearError]);

  const handlePageChange = useCallback(
    (direction: PageDirection) => {
      if (!canFetch) return;
      const pgState = usePRStore.getState().pages.reviewedByMe;
      const nav = resolveNav(pgState, direction);
      if (!nav) return;
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: true } }));
      fetchRaw(pgState.pageSize, nav.cursor)
        .then((page) => {
          const prs = page.pullRequests || [];
          usePRStore.setState((s) => ({
            pages: {
              ...s.pages,
              reviewedByMe: {
                ...s.pages.reviewedByMe,
                items: prs,
                currentPage: nav.newPage,
                cursorStack: nav.newStack,
                hasNextPage: page.pageInfo.hasNextPage,
                endCursor: page.pageInfo.endCursor,
                totalCount: page.pageInfo.totalCount,
                pageCache: {
                  ...s.pages.reviewedByMe.pageCache,
                  [nav.newPage]: { items: prs, pageInfo: page.pageInfo, fetchedAt: Date.now() },
                },
              },
            },
            isLoading: { ...s.isLoading, reviewedByMe: false },
          }));
        })
        .catch(() =>
          usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: false } })),
        );
    },
    [canFetch, fetchRaw],
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize("reviewedByMe", size, () => {
        if (!canFetch) return Promise.resolve();
        usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: true } }));
        return fetchPage(size, "");
      });
    },
    [canFetch, fetchPage, setPageSize],
  );

  const handleFetchMore = useCallback(() => {
    if (!canFetch) return;
    appendNextPage("reviewedByMe", (pageSize, cursor) => fetchRaw(pageSize, cursor));
  }, [canFetch, fetchRaw, appendNextPage]);

  useEffect(() => { loadAllTeams(); }, [loadAllTeams]);
  const viewerTeams = useMemo(
    () => (teamsByOrg[owner] || []).map((t) => ({ slug: t.teamSlug, name: t.teamName })),
    [teamsByOrg, owner],
  );

  // Filter out the viewer's own PRs — this page is for PRs authored by others.
  const viewerLogin = user?.login;
  const filteredItems = useMemo(
    () => viewerLogin ? pg.items.filter((pr) => pr.author !== viewerLogin) : pg.items,
    [pg.items, viewerLogin],
  );

  // Build set of flagged PR nodeIds for red border styling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flaggedNodeIds = useMemo(
    () => new Set(filteredItems.filter((pr) => isFlagged(pr)).map((pr) => pr.nodeId)),
    [filteredItems, flagRules],
  );

  // Fetch data when repo changes
  useEffect(() => {
    if (!isAuthenticated || !canFetch) return;
    usePRStore.getState().fetchIfStale("reviewedByMe", async () => {
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: true } }));
      await fetchPage(usePRStore.getState().pages.reviewedByMe.pageSize, "");
    }).catch(() =>
      usePRStore.setState((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: false } })),
    );
  }, [isAuthenticated, canFetch, owner, repo, fetchPage]);

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
            Select a repository from the sidebar to view reviewed PRs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reviewed by Me</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open pull requests you have reviewed in{" "}
            <span className="font-medium text-foreground">
              {`${owner}/${repo}`}
            </span>.
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
        data={filteredItems}
        isLoading={loading}
        showAuthor
        emptyMessage="No reviewed pull requests found."
        pagination={pg}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRefresh={forceRefresh}
        onFetchMore={handleFetchMore}
        viewerLogin={viewerLogin}
        flaggedNodeIds={flaggedNodeIds}
        viewerTeams={viewerTeams}
        onMerge={async (nodeId) => { await usePRStore.getState().mergePR(nodeId, "SQUASH"); forceRefresh(); }}
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
