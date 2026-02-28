import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  GitPullRequest,
  Eye,
  AlertTriangle,
  Settings,
  ChevronDown,
  Plus,
  FolderGit2,
} from "lucide-react";
import { WindowToggleMaximise } from "../../../wailsjs/runtime/runtime";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { usePRStore } from "@/stores/prStore";
import { useRepoStore } from "@/stores/repoStore";
import { useVimStore } from "@/stores/vimStore";
import { useFlagStore } from "@/stores/flagStore";

interface NavItem {
  to: string;
  label: string;
  icon: typeof GitPullRequest;
  badgeKey?: "myPRs" | "reviewRequests" | "flagged";
}

const navItems: NavItem[] = [
  { to: "/my-prs", label: "My PRs", icon: GitPullRequest, badgeKey: "myPRs" },
  {
    to: "/review-requests",
    label: "Review Requests",
    icon: Eye,
    badgeKey: "reviewRequests",
  },
  { to: "/flagged", label: "Flagged", icon: AlertTriangle, badgeKey: "flagged" },
  { to: "/settings", label: "Repo Settings", icon: Settings },
];

export function Sidebar() {
  const { isAuthenticated, user, checkAuth } = useAuthStore();
  const pages = usePRStore((s) => s.pages);
  const { repos, selectedRepoId, selectedRepo, selectRepo, addRepo, loadRepos, loadSelectedRepo } = useRepoStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isFlagged = useFlagStore((s) => s.isFlagged);
  const flagRules = useFlagStore((s) => s.rules);

  const flaggedCount = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...pages.reviewRequests.items, ...(pages.reviewedByMe?.items || [])];
    let count = 0;
    for (const pr of merged) {
      if (seen.has(pr.nodeId)) continue;
      seen.add(pr.nodeId);
      if (isFlagged(pr)) count++;
    }
    return count;
  }, [pages.reviewRequests.items, pages.reviewedByMe?.items, isFlagged, flagRules]);

  const badgeCounts: Record<string, number> = {
    myPRs: pages.myPRs.totalCount || pages.myPRs.items.length,
    reviewRequests: pages.reviewRequests.totalCount || pages.reviewRequests.items.length,
    flagged: flaggedCount,
  };

  useEffect(() => {
    checkAuth();
    loadRepos().then(() => loadSelectedRepo());
  }, [checkAuth, loadRepos, loadSelectedRepo]);

  // Reset highlight when dropdown opens/closes.
  useEffect(() => {
    if (dropdownOpen) {
      // Start with the currently selected repo highlighted.
      const idx = repos.findIndex((r) => r.id === selectedRepoId);
      setHighlightedIdx(idx >= 0 ? idx : 0);
    } else {
      setHighlightedIdx(-1);
    }
  }, [dropdownOpen, repos, selectedRepoId]);

  // Auto-scroll highlighted item into view.
  useEffect(() => {
    if (highlightedIdx >= 0 && itemRefs.current[highlightedIdx]) {
      itemRefs.current[highlightedIdx]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIdx]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Register vim Escape override when dropdown is open.
  useEffect(() => {
    if (dropdownOpen) {
      useVimStore.setState({ onEscape: () => setDropdownOpen(false) });
      return () => useVimStore.setState({ onEscape: null });
    }
  }, [dropdownOpen]);

  // Vim-style keyboard navigation when dropdown is open (j/k/Enter).
  // Uses keydown on window so it works even when no input is focused.
  useEffect(() => {
    if (!dropdownOpen || repos.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      // Don't interfere with text inputs.
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIdx((i) => Math.min(i + 1, repos.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIdx >= 0 && highlightedIdx < repos.length) {
          selectRepo(repos[highlightedIdx].id);
          setDropdownOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dropdownOpen, repos, highlightedIdx, selectRepo]);

  // Listen for global toggle event (Cmd+0 keybinding).
  useEffect(() => {
    const handler = () => setDropdownOpen((o) => !o);
    window.addEventListener("repo-selector:toggle", handler);
    return () => window.removeEventListener("repo-selector:toggle", handler);
  }, []);

  const handleAddRepo = useCallback(async () => {
    setDropdownOpen(false);
    await addRepo();
  }, [addRepo]);

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

      {/* Repo switcher */}
      <div className="border-b border-border p-2" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-left">
            {selectedRepo
              ? `${selectedRepo.repoOwner}/${selectedRepo.repoName}`
              : repos.length > 0
                ? "Select a repo"
                : "No repos added"}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", dropdownOpen && "rotate-180")} />
        </button>

        {dropdownOpen && (
          <div className="mt-1 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-md">
            {repos.map((repo, i) => (
              <button
                key={repo.id}
                ref={(el) => { itemRefs.current[i] = el; }}
                onClick={() => {
                  selectRepo(repo.id);
                  setDropdownOpen(false);
                }}
                onMouseEnter={() => setHighlightedIdx(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  repo.id === selectedRepoId && i !== highlightedIdx && "bg-accent/50 text-accent-foreground",
                  i === highlightedIdx && "bg-accent text-accent-foreground",
                )}
              >
                <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {repo.repoOwner}/{repo.repoName}
                  </p>
                </div>
              </button>
            ))}
            <button
              onClick={handleAddRepo}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add repository...
            </button>
          </div>
        )}
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
                    item.badgeKey === "flagged"
                      ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                      : item.badgeKey === "reviewRequests"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
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
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {user.login}
            </span>
            <NavLink
              to="/global-settings"
              className={({ isActive }) =>
                `rounded-md p-1 transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`
              }
              title="Global Settings"
            >
              <Settings className="h-4 w-4" />
            </NavLink>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not connected</p>
        )}
      </div>
    </aside>
  );
}
