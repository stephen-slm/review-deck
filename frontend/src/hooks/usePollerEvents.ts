import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { SetSetting } from "../../wailsjs/go/services/SettingsService";
import { usePRStore } from "@/stores/prStore";
import { useRepoStore } from "@/stores/repoStore";
import { github } from "../../wailsjs/go/models";
import { SendNotification } from "../../wailsjs/go/main/App";
import { useToast } from "@/components/ui/Toast";
import { dlog } from "@/lib/debugLog";

interface PollResult {
  myPRs: unknown[] | null;
  reviewRequests: unknown[] | null;
  teamReviewRequests: unknown[] | null;
  reviewedByMe: unknown[] | null;
  recentMerged: unknown[] | null;
  error?: string;
  timestamp: string;
}

interface Notification {
  type: string;
  title: string;
  repo: string;
  number: number;
  nodeId: string;
  url: string;
  author: string;
  message: string;
}

/**
 * Helper: reset a category's pagination after a poller update.
 * The poller fetches ALL results, so we slice them into page-sized chunks
 * and pre-populate the page cache so prev/next navigation works without
 * hitting the server (the cursors from a search query wouldn't be valid
 * for the poller's complete dataset anyway).
 */
function pollerPage(prev: { pageSize: number; items: unknown[] }, prs: github.PullRequest[]) {
  const pageSize = prev.pageSize;
  // If auto-fill previously grew page 1 beyond pageSize, preserve that count
  // so the user doesn't lose visible rows when the poller refreshes.
  const grownSize = Math.max(pageSize, prev.items.length);
  const page1Size = Math.min(grownSize, prs.length);
  const remaining = prs.slice(page1Size);
  const remainingPages = Math.max(0, Math.ceil(remaining.length / pageSize));
  const totalPages = 1 + remainingPages;

  // Pre-populate page cache with all pages.
  const pageCache: Record<number, { items: github.PullRequest[]; pageInfo: github.PageInfo; fetchedAt: number }> = {};
  // Page 1 may be larger than pageSize if auto-fill grew it.
  pageCache[1] = {
    items: prs.slice(0, page1Size),
    pageInfo: new github.PageInfo({
      hasNextPage: totalPages > 1,
      endCursor: "poller-1",
      totalCount: prs.length,
    }),
    fetchedAt: Date.now(),
  };
  for (let p = 2; p <= totalPages; p++) {
    const start = page1Size + (p - 2) * pageSize;
    pageCache[p] = {
      items: prs.slice(start, start + pageSize),
      pageInfo: new github.PageInfo({
        hasNextPage: p < totalPages,
        endCursor: `poller-${p}`,
        totalCount: prs.length,
      }),
      fetchedAt: Date.now(),
    };
  }

  return {
    items: prs.slice(0, page1Size),
    currentPage: 1,
    pageSize,
    // The poller fetches ALL data, so there are no more server pages to fetch.
    // Local page navigation still works via pageCache entries.
    hasNextPage: false,
    endCursor: "",
    totalCount: prs.length,
    cursorStack: [""],
    pageCache,
  };
}

/**
 * Listens for backend poller events:
 * - "poller:update"        -> pushes PR data into stores
 * - "poller:notifications" -> fires toast notifications for changes
 */
export function usePollerEvents() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const handleUpdate = (result: PollResult) => {
      dlog("poller:update", `err=${!!result.error} myPRs=${(result.myPRs||[]).length}`);
      if (result.error) {
        console.warn("poller error:", result.error);
        return;
      }

      // The poller fetches data for ALL tracked repos, but the frontend is
      // repo-scoped. Filter to only keep PRs matching the currently selected
      // repo so we don't overwrite the view with data from other repos.
      const { selectedRepo: selected } = useRepoStore.getState();
      const filterForRepo = (prs: github.PullRequest[]): github.PullRequest[] => {
        if (!selected) return prs;
        return prs.filter(
          (pr) => pr.repoOwner === selected.repoOwner && pr.repoName === selected.repoName,
        );
      };

      const now = Date.now();
      const nowStr = String(now);

      // The poller fetches ALL pages, so replace the data and reset pagination
      // state (cursors are no longer valid for the poller's complete result set).
      // Also update lastFetchedAt and persist timestamps so cache freshness
      // survives app restarts.
      if (result.myPRs) {
        const prs = filterForRepo(result.myPRs as github.PullRequest[]);
        usePRStore.setState((s) => ({
          pages: { ...s.pages, myPRs: pollerPage(s.pages.myPRs, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, myPRs: now },
        }));
        SetSetting("cache_ts:myPRs", nowStr).catch(() => {});
      }
      if (result.reviewRequests) {
        const prs = filterForRepo(result.reviewRequests as github.PullRequest[]);
        usePRStore.setState((s) => ({
          pages: { ...s.pages, reviewRequests: pollerPage(s.pages.reviewRequests, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, reviewRequests: now },
        }));
        SetSetting("cache_ts:reviewRequests", nowStr).catch(() => {});
      }
      if (result.reviewedByMe) {
        const prs = filterForRepo(result.reviewedByMe as github.PullRequest[]);
        usePRStore.setState((s) => ({
          pages: { ...s.pages, reviewedByMe: pollerPage(s.pages.reviewedByMe, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, reviewedByMe: now },
        }));
        SetSetting("cache_ts:reviewedByMe", nowStr).catch(() => {});
      }
      if (result.teamReviewRequests) {
        const prs = filterForRepo(result.teamReviewRequests as github.PullRequest[]);
        usePRStore.setState((s) => ({
          pages: { ...s.pages, teamReviewRequests: pollerPage(s.pages.teamReviewRequests, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, teamReviewRequests: now },
        }));
        SetSetting("cache_ts:teamReviewRequests", nowStr).catch(() => {});
      }
      if (result.recentMerged) {
        const prs = filterForRepo(result.recentMerged as github.PullRequest[]);
        usePRStore.setState((s) => ({
          pages: { ...s.pages, myRecentMerged: pollerPage(s.pages.myRecentMerged, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, myRecentMerged: now },
        }));
        SetSetting("cache_ts:myRecentMerged", nowStr).catch(() => {});
      }
    };

    const handleNotifications = (notifications: Notification[]) => {
      const windowFocused = document.hasFocus();

      for (const n of notifications) {
        if (windowFocused) {
          const toastType = notificationToastType(n.type);
          const onClick = n.nodeId
            ? () => navigate(`/pr/${n.nodeId}`)
            : undefined;
          addToast(n.message, toastType, 6000, onClick);
        } else {
          SendNotification("Review Deck", n.message);
        }
      }
    };

    EventsOn("poller:update", handleUpdate);
    EventsOn("poller:notifications", handleNotifications);
    return () => {
      EventsOff("poller:update");
      EventsOff("poller:notifications");
    };
  }, [addToast, navigate]);
}

function notificationToastType(type: string): "success" | "error" | "info" {
  switch (type) {
    case "pr-approved":
    case "ci-passed":
    case "pr-merged":
      return "success";
    case "ci-failed":
    case "changes-requested":
      return "error";
    default:
      return "info";
  }
}
