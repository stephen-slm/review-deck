import { useEffect, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCheck,
  Trash2,
  GitPullRequest,
  GitMerge,
  CircleCheck,
  AlertCircle,
  XCircle,
  CircleDot,
  Eye,
  Bell,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { useNotificationStore } from "@/stores/notificationStore";
import { useAuthStore } from "@/stores/authStore";
import { storage } from "../../wailsjs/go/models";

type FilterType = "all" | "unread" | "review-request" | "status" | "ci";

const filters: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "review-request", label: "Reviews" },
  { key: "status", label: "Status" },
  { key: "ci", label: "CI" },
];

function notificationIcon(eventType: string) {
  switch (eventType) {
    case "new-review-request":
      return <Eye className="h-4 w-4 text-amber-500" />;
    case "pr-merged":
      return <GitMerge className="h-4 w-4 text-purple-500" />;
    case "pr-approved":
      return <CircleCheck className="h-4 w-4 text-green-500" />;
    case "changes-requested":
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case "ci-failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "ci-passed":
      return <CircleCheck className="h-4 w-4 text-green-500" />;
    case "new-pr":
      return <GitPullRequest className="h-4 w-4 text-blue-500" />;
    default:
      return <CircleDot className="h-4 w-4 text-muted-foreground" />;
  }
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "new-review-request":
      return "Review Requested";
    case "pr-merged":
      return "Merged";
    case "pr-approved":
      return "Approved";
    case "changes-requested":
      return "Changes Requested";
    case "ci-failed":
      return "CI Failed";
    case "ci-passed":
      return "CI Passed";
    case "new-pr":
      return "New PR";
    default:
      return eventType;
  }
}

function matchesFilter(n: storage.AppNotification, filter: FilterType): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unread":
      return !n.read;
    case "review-request":
      return n.eventType === "new-review-request" || n.eventType === "pr-approved" || n.eventType === "changes-requested";
    case "status":
      return n.eventType === "pr-merged" || n.eventType === "new-pr";
    case "ci":
      return n.eventType === "ci-failed" || n.eventType === "ci-passed";
  }
}

export function InboxPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    notifications,
    unreadCount,
    isLoading,
    loadNotifications,
    markRead,
    markAllRead,
    deleteNotification,
    clearAll,
  } = useNotificationStore();

  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const filtered = useMemo(
    () => notifications.filter((n) => matchesFilter(n, filter)),
    [notifications, filter],
  );

  const handleClick = useCallback(
    (n: storage.AppNotification) => {
      if (!n.read) markRead(n.id);
      if (n.prNodeId) navigate(`/pr/${n.prNodeId}`);
    },
    [markRead, navigate],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      deleteNotification(id);
    },
    [deleteNotification],
  );

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

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inbox</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "All caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "relative px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            {f.key === "unread" && unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                {unreadCount}
              </span>
            )}
            {filter === f.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {isLoading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filter === "all"
              ? "No notifications yet. They'll appear here as changes are detected."
              : "No notifications match this filter."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                !n.read && "bg-accent/20",
              )}
            >
              {/* Unread dot */}
              <div className="flex shrink-0 pt-1">
                {!n.read ? (
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                ) : (
                  <span className="h-2 w-2" />
                )}
              </div>

              {/* Icon */}
              <div className="flex shrink-0 pt-0.5">
                {notificationIcon(n.eventType)}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      !n.read ? "font-semibold text-foreground" : "font-medium text-foreground",
                    )}
                  >
                    {n.title}
                  </span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {eventLabel(n.eventType)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {n.message}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/70">
                  {n.repo && <span>{n.repo}</span>}
                  {n.number > 0 && <span>#{n.number}</span>}
                  {n.createdAt && (
                    <span>{timeAgo(n.createdAt)}</span>
                  )}
                </div>
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(e, n.id)}
                className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Delete notification"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
