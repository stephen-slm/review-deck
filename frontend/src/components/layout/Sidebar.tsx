import { useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  GitPullRequest,
  Eye,
  CheckCircle,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { WindowToggleMaximise } from "../../../wailsjs/runtime/runtime";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { usePRStore } from "@/stores/prStore";
import { useFlagStore } from "@/stores/flagStore";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "myPRs" | "reviewRequests" | "reviewedByMe" | "flagged";
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-prs", label: "My PRs", icon: GitPullRequest, badgeKey: "myPRs" },
  {
    to: "/review-requests",
    label: "Review Requests",
    icon: Eye,
    badgeKey: "reviewRequests",
  },
  {
    to: "/reviewed",
    label: "Reviewed by Me",
    icon: CheckCircle,
    badgeKey: "reviewedByMe",
  },
  {
    to: "/flagged",
    label: "Flagged",
    icon: AlertTriangle,
    badgeKey: "flagged",
  },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { isAuthenticated, user, checkAuth } = useAuthStore();
  const pages = usePRStore((s) => s.pages);
  const isFlagged = useFlagStore((s) => s.isFlagged);
  // Subscribe to rules so we re-render when flag rules change.
  const flagRules = useFlagStore((s) => s.rules);

  // Compute flagged count: merge review requests + reviewed by me, deduplicate,
  // and count those matching any enabled flag rule.
  const flaggedCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    const allItems = [...pages.reviewRequests.items, ...pages.reviewedByMe.items];
    for (const pr of allItems) {
      if (seen.has(pr.nodeId)) continue;
      seen.add(pr.nodeId);
      if (isFlagged(pr)) count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.reviewRequests.items, pages.reviewedByMe.items, flagRules]);

  const badgeCounts: Record<string, number> = {
    myPRs: pages.myPRs.totalCount || pages.myPRs.items.length,
    reviewRequests: pages.reviewRequests.totalCount || pages.reviewRequests.items.length,
    reviewedByMe: pages.reviewedByMe.totalCount || pages.reviewedByMe.items.length,
    flagged: flaggedCount,
  };

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-card">
      {/* macOS titlebar spacer — drag region that sits behind the traffic lights */}
      <div className="wails-drag h-[38px] shrink-0" />
      <div
        className="flex h-10 shrink-0 items-center border-b border-border px-4"
        onDoubleClick={() => WindowToggleMaximise()}
      >
        <h1 className="text-lg font-semibold text-foreground">Review Deck</h1>
      </div>
      <nav className="flex-1 space-y-1 p-1.5">
        {navItems.map((item, idx) => {
          const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {isAuthenticated && count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                    item.badgeKey === "reviewRequests"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                      : item.badgeKey === "flagged"
                        ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                        : "bg-secondary text-secondary-foreground"
                  )}
                >
                  {count}
                </span>
              )}
              <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">
                {"\u2318"}{idx + 1}
              </kbd>
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.login}
                className="h-6 w-6 rounded-full"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-medium">
                {user.login[0]?.toUpperCase()}
              </div>
            )}
            <span className="truncate text-xs text-muted-foreground">
              {user.login}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not connected</p>
        )}
      </div>
    </aside>
  );
}
