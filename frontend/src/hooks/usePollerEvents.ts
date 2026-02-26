import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { SetSetting } from "../../wailsjs/go/services/SettingsService";
import { usePRStore } from "@/stores/prStore";
import { github } from "../../wailsjs/go/models";
import { useToast } from "@/components/ui/Toast";

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
 * Helper: reset a category's pagination to show the full poller dataset as page 1.
 * Since the poller fetches ALL results, there are no more server pages.
 */
function pollerPage(prev: { pageSize: number }, prs: github.PullRequest[]) {
  return {
    items: prs,
    currentPage: 1,
    pageSize: prev.pageSize,
    hasNextPage: false,
    endCursor: "",
    totalCount: prs.length,
    cursorStack: [""],
    pageCache: {},
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
      if (result.error) {
        console.warn("poller error:", result.error);
        return;
      }

      const now = Date.now();
      const nowStr = String(now);

      // The poller fetches ALL pages, so replace the data and reset pagination
      // state (cursors are no longer valid for the poller's complete result set).
      // Also update lastFetchedAt and persist timestamps so cache freshness
      // survives app restarts.
      if (result.myPRs) {
        const prs = result.myPRs as github.PullRequest[];
        usePRStore.setState((s) => ({
          pages: { ...s.pages, myPRs: pollerPage(s.pages.myPRs, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, myPRs: now },
        }));
        SetSetting("cache_ts:myPRs", nowStr).catch(() => {});
      }
      if (result.reviewRequests) {
        const prs = result.reviewRequests as github.PullRequest[];
        usePRStore.setState((s) => ({
          pages: { ...s.pages, reviewRequests: pollerPage(s.pages.reviewRequests, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, reviewRequests: now },
        }));
        SetSetting("cache_ts:reviewRequests", nowStr).catch(() => {});
      }
      if (result.reviewedByMe) {
        const prs = result.reviewedByMe as github.PullRequest[];
        usePRStore.setState((s) => ({
          pages: { ...s.pages, reviewedByMe: pollerPage(s.pages.reviewedByMe, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, reviewedByMe: now },
        }));
        SetSetting("cache_ts:reviewedByMe", nowStr).catch(() => {});
      }
      if (result.teamReviewRequests) {
        const prs = result.teamReviewRequests as github.PullRequest[];
        usePRStore.setState((s) => ({
          pages: { ...s.pages, teamReviewRequests: pollerPage(s.pages.teamReviewRequests, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, teamReviewRequests: now },
        }));
        SetSetting("cache_ts:teamReviewRequests", nowStr).catch(() => {});
      }
      if (result.recentMerged) {
        const prs = result.recentMerged as github.PullRequest[];
        usePRStore.setState((s) => ({
          pages: { ...s.pages, myRecentMerged: pollerPage(s.pages.myRecentMerged, prs) },
          lastFetchedAt: { ...s.lastFetchedAt, myRecentMerged: now },
        }));
        SetSetting("cache_ts:myRecentMerged", nowStr).catch(() => {});
      }
    };

    const handleNotifications = (notifications: Notification[]) => {
      for (const n of notifications) {
        const toastType = notificationToastType(n.type);
        const onClick = n.nodeId
          ? () => navigate(`/pr/${n.nodeId}`)
          : undefined;
        addToast(n.message, toastType, 6000, onClick);
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
