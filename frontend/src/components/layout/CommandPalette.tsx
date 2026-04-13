import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  FolderGit2,
  Plus,
  Check,
  Compass,
  ExternalLink,
  CheckCircle,
  GitMerge,
  UserPlus,
  Tag,
  Type,
  FileText,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  MessageSquareWarning,
  RefreshCw,
  Terminal,
  GitBranch,
  Keyboard,
  ArrowLeft,
  LogOut,
  Copy,
  X,
  GitPullRequest,
  EyeOff,
  PenLine,
  Layers,
  CheckCircle2,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { useVimStore, getActions } from "@/stores/vimStore";
import { usePRStore, getAllItems, type CacheKey } from "@/stores/prStore";
import { useRepoStore } from "@/stores/repoStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTheme } from "@/theme/ThemeProvider";
import { cn } from "@/lib/utils";
import { CheckoutPR, OpenTerminal as OpenTerminalInRepo } from "../../../wailsjs/go/services/WorkspaceService";
import { MarkReadyForReview } from "../../../wailsjs/go/services/PullRequestService";
import { github } from "../../../wailsjs/go/models";
import { StateBadge } from "@/components/pr/StateBadge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  icon: LucideIcon;
  action: () => void;
}

interface CategoryGroup {
  category: string;
  items: Command[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
const modKey = isMac ? "\u2318" : "Ctrl+";

/** List page routes where PRTable filter toggles make sense. */
const LIST_ROUTES = ["/my-prs", "/review-requests", "/reviewed", "/flagged"];

/** Collect and deduplicate PRs across all store categories. */
function collectAllPRs(): github.PullRequest[] {
  const keys: CacheKey[] = ["myPRs", "myRecentMerged", "reviewRequests", "teamReviewRequests", "reviewedByMe"];
  const seen = new Set<string>();
  const result: github.PullRequest[] = [];
  for (const key of keys) {
    for (const pr of getAllItems(key)) {
      if (!seen.has(pr.nodeId)) {
        seen.add(pr.nodeId);
        result.push(pr);
      }
    }
  }
  return result;
}

/** Find a PR by nodeId across all store categories (current page items). */
function findPRByNodeId(nodeId: string): github.PullRequest | undefined {
  const p = usePRStore.getState().pages;
  const all = [
    ...p.myPRs.items,
    ...p.myRecentMerged.items,
    ...p.reviewRequests.items,
    ...p.teamReviewRequests.items,
    ...p.reviewedByMe.items,
  ];
  return all.find((pr) => pr.nodeId === nodeId);
}

type PaletteMode = "commands" | "repos";

/** Build a flat list of all commands, filtering by availability. */
function buildCommands(
  navigate: ReturnType<typeof useNavigate>,
  location: ReturnType<typeof useLocation>,
  setTheme: (t: string) => void,
  themeChoice: string,
  close: () => void,
  repos: ReturnType<typeof useRepoStore.getState>["repos"],
  enterRepoMode: () => void,
): Command[] {
  const cmds: Command[] = [];
  const actions = getActions();
  const onPRDetail = location.pathname.startsWith("/pr/");
  const onListPage = LIST_ROUTES.some((r) => location.pathname.startsWith(r));
  const isAuthenticated = useAuthStore.getState().isAuthenticated;

  // ---- Navigation ----
  const navItems: { label: string; path: string; shortcut: string }[] = [
    { label: "Go to My PRs", path: "/my-prs", shortcut: `${modKey}1` },
    { label: "Go to Review Requests", path: "/review-requests", shortcut: `${modKey}2` },
    { label: "Go to Reviewed by Me", path: "/reviewed", shortcut: `${modKey}3` },
    { label: "Go to Flagged PRs", path: "/flagged", shortcut: `${modKey}4` },
    { label: "Go to Repo Settings", path: "/settings", shortcut: `${modKey}5` },
    { label: "Go to Global Settings", path: "/global-settings", shortcut: "" },
  ];

  for (const nav of navItems) {
    cmds.push({
      id: `nav:${nav.path}`,
      label: nav.label,
      shortcut: nav.shortcut,
      category: "Navigation",
      icon: Compass,
      action: () => { close(); navigate(nav.path); },
    });
  }

  cmds.push({
    id: "nav:back",
    label: "Go Back",
    shortcut: "Backspace",
    category: "Navigation",
    icon: ArrowLeft,
    action: () => { close(); navigate(-1); },
  });

  // ---- Switch repo (enters repo-only mode) ----
  if (repos.length > 0) {
    cmds.push({
      id: "action:switch-repo",
      label: "Switch Repository",
      shortcut: `${modKey}0`,
      category: "Actions",
      icon: FolderGit2,
      action: enterRepoMode,
    });
  }

  // ---- Global Actions ----
  if (actions.onRefresh) {
    const handler = actions.onRefresh;
    cmds.push({
      id: "action:refresh",
      label: "Refresh",
      shortcut: "R",
      category: "Actions",
      icon: RefreshCw,
      action: () => { close(); handler(); },
    });
  }

  if (actions.onFocusSearch) {
    const handler = actions.onFocusSearch;
    cmds.push({
      id: "action:focus-search",
      label: "Focus Search / Filter",
      shortcut: "/",
      category: "Actions",
      icon: Search,
      action: () => { close(); handler(); },
    });
  }

  cmds.push({
    id: "action:show-shortcuts",
    label: "Show Keyboard Shortcuts",
    shortcut: "?",
    category: "Actions",
    icon: Keyboard,
    action: () => { close(); useVimStore.getState().toggleHints(); },
  });

  if (isAuthenticated) {
    cmds.push({
      id: "action:force-refresh",
      label: "Force Refresh All Data",
      shortcut: "",
      category: "Actions",
      icon: RefreshCw,
      action: () => {
        close();
        const orgs = useSettingsStore.getState().orgs;
        usePRStore.getState().fetchAll(orgs, true);
      },
    });
  }

  if (actions.onCopy) {
    const handler = actions.onCopy;
    cmds.push({
      id: "action:copy",
      label: "Copy PR to Clipboard",
      shortcut: "c",
      category: "Actions",
      icon: Copy,
      action: () => { close(); handler(); },
    });
  }

  if (isAuthenticated) {
    cmds.push({
      id: "action:sign-out",
      label: "Sign Out",
      shortcut: "",
      category: "Actions",
      icon: LogOut,
      action: () => {
        close();
        useAuthStore.getState().logout();
        navigate("/global-settings");
      },
    });
  }

  // ---- Filter Toggles (list pages only) ----
  if (onListPage) {
    if (actions.onToggleDrafts) {
      const handler = actions.onToggleDrafts;
      cmds.push({
        id: "filter:drafts",
        label: "Toggle Draft PRs",
        shortcut: "t",
        category: "Filters",
        icon: PenLine,
        action: () => { close(); handler(); },
      });
    }

    if (actions.onToggleStacked) {
      const handler = actions.onToggleStacked;
      cmds.push({
        id: "filter:stacked",
        label: "Toggle Stacked PRs",
        shortcut: "s",
        category: "Filters",
        icon: Layers,
        action: () => { close(); handler(); },
      });
    }

    if (actions.onToggleApproved) {
      const handler = actions.onToggleApproved;
      cmds.push({
        id: "filter:approved",
        label: "Toggle Approved by Me",
        shortcut: "f",
        category: "Filters",
        icon: CheckCircle2,
        action: () => { close(); handler(); },
      });
    }

    if (actions.onToggleAllRepos) {
      const handler = actions.onToggleAllRepos;
      cmds.push({
        id: "filter:all-repos",
        label: "Toggle All Repositories",
        shortcut: "g",
        category: "Filters",
        icon: FolderGit2,
        action: () => { close(); handler(); },
      });
    }

    if (actions.onHide) {
      const handler = actions.onHide;
      cmds.push({
        id: "filter:hide",
        label: "Hide Selected PR",
        shortcut: "x",
        category: "Filters",
        icon: X,
        action: () => {
          close();
          const idx = useVimStore.getState().selectedIndex;
          if (idx >= 0) handler(idx);
        },
      });
    }

    const hiddenCount = usePRStore.getState().hiddenPRs.size;
    if (hiddenCount > 0) {
      cmds.push({
        id: "filter:unhide-all",
        label: `Unhide All PRs (${hiddenCount} hidden)`,
        shortcut: "",
        category: "Filters",
        icon: EyeOff,
        action: () => { close(); usePRStore.getState().clearAllHiddenPRs(); },
      });
    }
  }

  // ---- PR Detail actions (only on /pr/* routes) ----
  if (onPRDetail) {
    const prItems: { label: string; shortcut: string; icon: LucideIcon; handler: (() => void) | null }[] = [
      { label: "Open in GitHub", shortcut: "o", icon: ExternalLink, handler: actions.onOpenExternal ? () => actions.onOpenExternal!(0) : null },
      { label: "Approve PR", shortcut: "A", icon: CheckCircle, handler: actions.onApprove },
      { label: "Request Changes", shortcut: "d", icon: MessageSquareWarning, handler: actions.onRequestChanges },
      { label: "Merge PR", shortcut: "m", icon: GitMerge, handler: actions.onMerge },
      { label: "Assign Reviewer", shortcut: "a", icon: UserPlus, handler: actions.onAssignReviewer },
      { label: "Assign Label", shortcut: "b", icon: Tag, handler: actions.onAssignLabel },
    ];

    for (const item of prItems) {
      if (item.handler) {
        const handler = item.handler;
        cmds.push({
          id: `pr:${item.label}`,
          label: item.label,
          shortcut: item.shortcut,
          category: "PR Actions",
          icon: item.icon,
          action: () => { close(); handler(); },
        });
      }
    }

    // ---- Workspace actions (checkout, terminal) ----
    const nodeId = location.pathname.replace("/pr/", "");
    const pr = findPRByNodeId(nodeId);
    if (pr) {
      const trackedRepo = repos.find(
        (r) => r.repoOwner === pr.repoOwner && r.repoName === pr.repoName,
      );
      if (trackedRepo?.localPath) {
        cmds.push({
          id: "workspace:checkout",
          label: `Checkout Branch: ${pr.headRef}`,
          shortcut: "",
          category: "Workspace",
          icon: GitBranch,
          action: () => {
            close();
            CheckoutPR(pr.repoOwner, pr.repoName, pr.number).catch(() => {});
          },
        });

        cmds.push({
          id: "workspace:terminal",
          label: "Open Terminal in Repo",
          shortcut: "",
          category: "Workspace",
          icon: Terminal,
          action: () => {
            close();
            OpenTerminalInRepo(pr.repoOwner, pr.repoName).catch(() => {});
          },
        });
      }

      // Mark ready for review (only for draft PRs authored by the current user)
      if (pr.isDraft) {
        const viewerLogin = useAuthStore.getState().user?.login;
        if (viewerLogin && pr.author === viewerLogin) {
          cmds.push({
            id: "pr:mark-ready",
            label: "Mark Ready for Review",
            shortcut: "",
            category: "PR Actions",
            icon: CircleDot,
            action: () => {
              close();
              MarkReadyForReview(pr.nodeId).catch(() => {});
            },
          });
        }
      }
    }

    // ---- AI actions ----
    const aiItems: { label: string; shortcut: string; icon: LucideIcon; handler: (() => void) | null }[] = [
      { label: "Generate AI Title", shortcut: "H", icon: Type, handler: actions.onGenerateTitle },
      { label: "Generate AI Description", shortcut: "D", icon: FileText, handler: actions.onGenerate },
      { label: "Generate AI Review", shortcut: "E", icon: Sparkles, handler: actions.onGenerateReview },
    ];

    for (const item of aiItems) {
      if (item.handler) {
        const handler = item.handler;
        cmds.push({
          id: `ai:${item.label}`,
          label: item.label,
          shortcut: item.shortcut,
          category: "AI",
          icon: item.icon,
          action: () => { close(); handler(); },
        });
      }
    }
  }

  // ---- Theme ----
  const themeItems: { label: string; value: string; icon: LucideIcon }[] = [
    { label: "Switch to Light Theme", value: "light", icon: Sun },
    { label: "Switch to Dark Theme", value: "dark", icon: Moon },
    { label: "Switch to System Theme", value: "system", icon: Monitor },
  ];

  for (const t of themeItems) {
    if (t.value !== themeChoice) {
      cmds.push({
        id: `theme:${t.value}`,
        label: t.label,
        category: "Theme",
        icon: t.icon,
        action: () => { close(); setTheme(t.value); },
      });
    }
  }

  return cmds;
}

/** Group commands by category, preserving insertion order. */
function groupByCategory(commands: Command[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  const map = new Map<string, Command[]>();
  for (const cmd of commands) {
    let list = map.get(cmd.category);
    if (!list) {
      list = [];
      map.set(cmd.category, list);
      groups.push({ category: cmd.category, items: list });
    }
    list.push(cmd);
  }
  return groups;
}

/** Max number of PR search results to display. */
const MAX_PR_RESULTS = 10;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const isOpen = useVimStore((s) => s.commandPaletteOpen);
  const toggle = useVimStore((s) => s.toggleCommandPalette);

  const repos = useRepoStore((s) => s.repos);
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const addRepo = useRepoStore((s) => s.addRepo);

  const navigate = useNavigate();
  const location = useLocation();
  const { setTheme, themeChoice } = useTheme();

  const [query, setQuery] = useState("");
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [mode, setMode] = useState<PaletteMode>("commands");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const close = useCallback(() => {
    if (isOpen) toggle();
  }, [isOpen, toggle]);

  const enterRepoMode = useCallback(() => {
    setMode("repos");
    setQuery("");
    setHighlightedIdx(0);
  }, []);

  // Build the full list of commands + repo items, then filter by query.
  const commands = useMemo(
    () => (isOpen ? buildCommands(navigate, location, setTheme, themeChoice, close, repos, enterRepoMode) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, navigate, location.pathname, setTheme, themeChoice, close, repos, enterRepoMode],
  );

  // Filter repos by search query.
  const filteredRepos = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return repos;
    const matches = repos.filter((r) =>
      `${r.repoOwner}/${r.repoName}`.toLowerCase().includes(q),
    );
    return matches.sort((a, b) => {
      const aName = a.repoName.toLowerCase();
      const bName = b.repoName.toLowerCase();
      const aExact = aName === q;
      const bExact = bName === q;
      if (aExact !== bExact) return aExact ? -1 : 1;
      const aStarts = aName.startsWith(q);
      const bStarts = bName.startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      const aNameMatch = aName.includes(q);
      const bNameMatch = bName.includes(q);
      if (aNameMatch !== bNameMatch) return aNameMatch ? -1 : 1;
      return 0;
    });
  }, [repos, query]);

  // Filter commands by query.
  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // PR search: only when query is non-empty, search across all loaded PRs.
  const filteredPRs = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || !isOpen) return [];

    const allPRs = collectAllPRs();
    const numQuery = q.replace(/^#/, "");
    const isNumeric = /^\d+$/.test(numQuery);

    const matches = allPRs.filter((pr) => {
      // Match against PR number
      if (isNumeric && String(pr.number).includes(numQuery)) return true;
      // Match against title
      if (pr.title.toLowerCase().includes(q)) return true;
      // Match against author
      if (pr.author.toLowerCase().includes(q)) return true;
      // Match against branch name
      if (pr.headRef.toLowerCase().includes(q)) return true;
      // Match against repo name
      if (`${pr.repoOwner}/${pr.repoName}`.toLowerCase().includes(q)) return true;
      if (pr.repoName.toLowerCase().includes(q)) return true;
      // Match against labels
      if (pr.labels?.some((l) => l.name.toLowerCase().includes(q))) return true;
      return false;
    });

    // Rank: exact number match first, then title starts-with, then title contains, then other matches.
    matches.sort((a, b) => {
      if (isNumeric) {
        const aExact = String(a.number) === numQuery;
        const bExact = String(b.number) === numQuery;
        if (aExact !== bExact) return aExact ? -1 : 1;
        const aStarts = String(a.number).startsWith(numQuery);
        const bStarts = String(b.number).startsWith(numQuery);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
      }
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aTitleStarts = aTitle.startsWith(q);
      const bTitleStarts = bTitle.startsWith(q);
      if (aTitleStarts !== bTitleStarts) return aTitleStarts ? -1 : 1;
      const aTitleMatch = aTitle.includes(q);
      const bTitleMatch = bTitle.includes(q);
      if (aTitleMatch !== bTitleMatch) return aTitleMatch ? -1 : 1;
      // Prefer more recently updated
      const aTime = new Date(a.updatedAt).getTime() || 0;
      const bTime = new Date(b.updatedAt).getTime() || 0;
      return bTime - aTime;
    });

    return matches.slice(0, MAX_PR_RESULTS);
  }, [query, isOpen]);

  // Build grouped display: command groups first, then PRs, then repos, then add-repo.
  const commandGroups = useMemo(
    () => groupByCategory(filteredCommands),
    [filteredCommands],
  );

  // Build the flat selectable items list for keyboard navigation.
  type SelectableItem =
    | { type: "command"; command: Command }
    | { type: "pr"; pr: github.PullRequest }
    | { type: "repo"; index: number }
    | { type: "add-repo" };

  const selectableItems = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];
    if (mode === "commands") {
      for (const group of commandGroups) {
        for (const cmd of group.items) {
          items.push({ type: "command", command: cmd });
        }
      }
      for (const pr of filteredPRs) {
        items.push({ type: "pr", pr });
      }
      for (let i = 0; i < filteredRepos.length; i++) {
        items.push({ type: "repo", index: i });
      }
      items.push({ type: "add-repo" });
    } else {
      // repos mode
      for (let i = 0; i < filteredRepos.length; i++) {
        items.push({ type: "repo", index: i });
      }
      items.push({ type: "add-repo" });
    }
    return items;
  }, [mode, commandGroups, filteredPRs, filteredRepos]);

  const totalItems = selectableItems.length;

  // Reset state when opening.
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHighlightedIdx(0);
      setMode("commands");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll highlighted item into view.
  useEffect(() => {
    const el = itemRefs.current[highlightedIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  // Clamp highlight when the filtered list changes.
  useEffect(() => {
    setHighlightedIdx((prev) => Math.min(prev, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  const handleSelect = useCallback(
    (idx: number) => {
      const item = selectableItems[idx];
      if (!item) return;
      if (item.type === "command") {
        item.command.action();
      } else if (item.type === "pr") {
        close();
        navigate(`/pr/${item.pr.nodeId}`);
      } else if (item.type === "repo") {
        selectRepo(filteredRepos[item.index].id);
        close();
      } else {
        close();
        addRepo();
      }
    },
    [selectableItems, filteredRepos, selectRepo, addRepo, close, navigate],
  );

  // Keyboard navigation within the palette.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setHighlightedIdx((prev) => (prev + 1) % totalItems);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setHighlightedIdx((prev) => (prev - 1 + totalItems) % totalItems);
          break;
        }
        case "Tab": {
          e.preventDefault();
          if (e.shiftKey) {
            setHighlightedIdx((prev) => (prev - 1 + totalItems) % totalItems);
          } else {
            setHighlightedIdx((prev) => (prev + 1) % totalItems);
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          handleSelect(highlightedIdx);
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (mode !== "commands") {
            setMode("commands");
            setQuery("");
            setHighlightedIdx(0);
          } else {
            close();
          }
          break;
        }
        case "Backspace": {
          // When query is empty in repos mode, go back to commands mode.
          if (mode !== "commands" && query === "") {
            e.preventDefault();
            setMode("commands");
            setHighlightedIdx(0);
          }
          break;
        }
        case "k": {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            close();
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, totalItems, highlightedIdx, handleSelect, close, mode, query]);

  if (!isOpen) return null;

  // Track the flat index counter for itemRefs / highlighting.
  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/50"
      onClick={close}
    >
      <div
        className="mt-[18vh] h-fit w-full max-w-lg animate-in fade-in slide-in-from-top-2 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            {mode !== "commands" ? (
              <button
                onClick={() => { setMode("commands"); setQuery(""); setHighlightedIdx(0); }}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                title="Back to commands"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIdx(0);
              }}
              placeholder={mode === "repos" ? "Search repositories..." : "Type a command or search PRs..."}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              {mode === "repos" ? "esc" : `${modKey}K`}
            </kbd>
          </div>

          {/* Results list */}
          <div ref={listRef} className="max-h-[40vh] overflow-auto py-1">
            {totalItems === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {mode === "repos" ? "No matching repositories" : "No matching commands, PRs, or repositories"}
              </div>
            )}

            {/* Command groups (only in commands mode) */}
            {mode === "commands" && commandGroups.map((group) => (
              <div key={group.category}>
                <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.category}
                </div>
                {group.items.map((cmd) => {
                  const idx = flatIdx++;
                  const isHighlighted = idx === highlightedIdx;
                  const Icon = cmd.icon;
                  return (
                    <div
                      key={cmd.id}
                      ref={(el) => { itemRefs.current[idx] = el; }}
                      onClick={() => handleSelect(idx)}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      className={cn(
                        "mx-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors",
                        isHighlighted && "bg-primary/5 ring-1 ring-primary/40",
                        !isHighlighted && "hover:bg-muted/50",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", isHighlighted ? "text-primary" : "text-muted-foreground")} />
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* PR search results (only in commands mode) */}
            {mode === "commands" && filteredPRs.length > 0 && (
              <div>
                <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Pull Requests
                </div>
                {filteredPRs.map((pr) => {
                  const idx = flatIdx++;
                  const isHighlighted = idx === highlightedIdx;
                  return (
                    <div
                      key={pr.nodeId}
                      ref={(el) => { itemRefs.current[idx] = el; }}
                      onClick={() => handleSelect(idx)}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      className={cn(
                        "mx-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors",
                        isHighlighted && "bg-primary/5 ring-1 ring-primary/40",
                        !isHighlighted && "hover:bg-muted/50",
                      )}
                    >
                      <GitPullRequest className={cn("h-4 w-4 shrink-0", isHighlighted ? "text-primary" : "text-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {pr.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{pr.repoOwner}/{pr.repoName}</span>
                          <span className="font-mono">#{pr.number}</span>
                          {pr.authorAvatar && (
                            <img
                              src={pr.authorAvatar}
                              className="h-3 w-3 rounded-full"
                              alt=""
                            />
                          )}
                          <span>{pr.author}</span>
                        </div>
                      </div>
                      <StateBadge
                        state={pr.state}
                        isDraft={pr.isDraft}
                        isInMergeQueue={pr.isInMergeQueue}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Repositories section */}
            {(filteredRepos.length > 0 || query.trim() === "") && (
              <div>
                {(filteredRepos.length > 0) && mode === "commands" && (
                  <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Repositories
                  </div>
                )}
                {filteredRepos.map((repo) => {
                  const idx = flatIdx++;
                  const isSelected = repo.id === selectedRepoId;
                  const isHighlighted = idx === highlightedIdx;
                  return (
                    <div
                      key={repo.id}
                      ref={(el) => { itemRefs.current[idx] = el; }}
                      onClick={() => handleSelect(idx)}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      className={cn(
                        "mx-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors",
                        isHighlighted && "bg-primary/5 ring-1 ring-primary/40",
                        !isHighlighted && "hover:bg-muted/50",
                      )}
                    >
                      <FolderGit2 className={cn("h-4 w-4 shrink-0", isHighlighted ? "text-primary" : "text-muted-foreground")} />
                      <span className="flex-1 truncate">
                        {repo.repoOwner}/{repo.repoName}
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add repository action */}
            {(() => {
              const idx = flatIdx++;
              const isHighlighted = idx === highlightedIdx;
              return (
                <div className="border-t border-border px-1 py-1">
                  <div
                    ref={(el) => { itemRefs.current[idx] = el; }}
                    onClick={() => handleSelect(idx)}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors",
                      isHighlighted && "bg-primary/5 ring-1 ring-primary/40 text-foreground",
                      !isHighlighted && "hover:bg-muted/50",
                    )}
                  >
                    <Plus className={cn("h-4 w-4 shrink-0", isHighlighted && "text-primary")} />
                    <span className="flex-1">Add repository...</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&uarr;</kbd>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&darr;</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&crarr;</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
