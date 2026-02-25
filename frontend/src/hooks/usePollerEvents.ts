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

      if (result.myPRs) {
        usePRStore.setState({ myPRs: result.myPRs as typeof state.myPRs });
      }
      if (result.reviewRequests) {
        usePRStore.setState({
          reviewRequests: result.reviewRequests as typeof state.reviewRequests,
        });
      }
      if (result.reviewedByMe) {
        usePRStore.setState({
          reviewedByMe: result.reviewedByMe as typeof state.reviewedByMe,
        });
      }
      if (result.recentMerged) {
        usePRStore.setState({
          myRecentMerged: result.recentMerged as typeof state.myRecentMerged,
        });
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
