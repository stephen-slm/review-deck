import { useEffect } from "react";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { usePRStore } from "@/stores/prStore";
import { useToast } from "@/components/ui/Toast";

interface PollResult {
  myPRs: unknown[] | null;
  reviewRequests: unknown[] | null;
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
  url: string;
  author: string;
  message: string;
}

/**
 * Listens for backend poller events:
 * - "poller:update"        -> pushes PR data into stores
 * - "poller:notifications" -> fires toast notifications for changes
 */
export function usePollerEvents() {
  const { addToast } = useToast();

  useEffect(() => {
    const handleUpdate = (result: PollResult) => {
      if (result.error) {
        console.warn("poller error:", result.error);
        return;
      }

      const state = usePRStore.getState();
      const noMorePages = { endCursor: "", hasNextPage: false, totalCount: 0 };

      // The poller fetches ALL pages, so replace the data and reset pagination
      // state (cursors are no longer valid for the poller's complete result set).
      if (result.myPRs) {
        const prs = result.myPRs as typeof state.myPRs;
        usePRStore.setState((s) => ({
          myPRs: prs,
          pageState: { ...s.pageState, myPRs: { ...noMorePages, totalCount: prs.length } },
        }));
      }
      if (result.reviewRequests) {
        const prs = result.reviewRequests as typeof state.reviewRequests;
        usePRStore.setState((s) => ({
          reviewRequests: prs,
          pageState: { ...s.pageState, reviewRequests: { ...noMorePages, totalCount: prs.length } },
        }));
      }
      if (result.reviewedByMe) {
        const prs = result.reviewedByMe as typeof state.reviewedByMe;
        usePRStore.setState((s) => ({
          reviewedByMe: prs,
          pageState: { ...s.pageState, reviewedByMe: { ...noMorePages, totalCount: prs.length } },
        }));
      }
      if (result.recentMerged) {
        const prs = result.recentMerged as typeof state.myRecentMerged;
        usePRStore.setState((s) => ({
          myRecentMerged: prs,
          pageState: { ...s.pageState, myRecentMerged: { ...noMorePages, totalCount: prs.length } },
        }));
      }
    };

    const handleNotifications = (notifications: Notification[]) => {
      for (const n of notifications) {
        const toastType = notificationToastType(n.type);
        addToast(n.message, toastType, 6000);
      }
    };

    EventsOn("poller:update", handleUpdate);
    EventsOn("poller:notifications", handleNotifications);
    return () => {
      EventsOff("poller:update");
      EventsOff("poller:notifications");
    };
  }, [addToast]);
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
