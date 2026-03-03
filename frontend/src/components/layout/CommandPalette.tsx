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
  type LucideIcon,
} from "lucide-react";
import { useVimStore } from "@/stores/vimStore";
import { getActions } from "@/stores/vimStore";
import { useRepoStore } from "@/stores/repoStore";
import { useTheme } from "@/theme/ThemeProvider";
import { cn } from "@/lib/utils";

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

/** Build a flat list of all commands, filtering by availability. */
function buildCommands(
  navigate: ReturnType<typeof useNavigate>,
  location: ReturnType<typeof useLocation>,
  setTheme: (t: string) => void,
  themeChoice: string,
  close: () => void,
): Command[] {
  const cmds: Command[] = [];

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
      action: () => {
        close();
        navigate(nav.path);
      },
    });
  }

  // ---- PR Detail actions (only on /pr/* routes) ----
  const onPRDetail = location.pathname.startsWith("/pr/");
  if (onPRDetail) {
    const actions = getActions();

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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const close = useCallback(() => {
    if (isOpen) toggle();
  }, [isOpen, toggle]);

  // Build the full list of commands + repo items, then filter by query.
  const commands = useMemo(
    () => (isOpen ? buildCommands(navigate, location, setTheme, themeChoice, close) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, navigate, location.pathname, setTheme, themeChoice, close],
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

  // Build grouped display: command groups first, then repos, then add-repo.
  const commandGroups = useMemo(
    () => groupByCategory(filteredCommands),
    [filteredCommands],
  );

  // Build the flat selectable items list for keyboard navigation.
  // This excludes category headers — they're purely visual.
  type SelectableItem =
    | { type: "command"; command: Command }
    | { type: "repo"; index: number }
    | { type: "add-repo" };

  const selectableItems = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];
    for (const group of commandGroups) {
      for (const cmd of group.items) {
        items.push({ type: "command", command: cmd });
      }
    }
    for (let i = 0; i < filteredRepos.length; i++) {
      items.push({ type: "repo", index: i });
    }
    items.push({ type: "add-repo" });
    return items;
  }, [commandGroups, filteredRepos]);

  const totalItems = selectableItems.length;

  // Reset state when opening.
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHighlightedIdx(0);
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
      } else if (item.type === "repo") {
        selectRepo(filteredRepos[item.index].id);
        close();
      } else {
        close();
        addRepo();
      }
    },
    [selectableItems, filteredRepos, selectRepo, addRepo, close],
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
          close();
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
  }, [isOpen, totalItems, highlightedIdx, handleSelect, close]);

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
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIdx(0);
              }}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              {modKey}K
            </kbd>
          </div>

          {/* Results list */}
          <div ref={listRef} className="max-h-[40vh] overflow-auto py-1">
            {totalItems === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No matching commands or repositories
              </div>
            )}

            {/* Command groups */}
            {commandGroups.map((group) => (
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
                        "flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors",
                        isHighlighted && "bg-accent text-accent-foreground",
                        !isHighlighted && "text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
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

            {/* Repositories section */}
            {(filteredRepos.length > 0 || query.trim() === "") && (
              <div>
                {(filteredRepos.length > 0) && (
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
                        "flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors",
                        isHighlighted && "bg-accent text-accent-foreground",
                        !isHighlighted && "text-foreground",
                      )}
                    >
                      <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
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
              return (
                <div
                  ref={(el) => { itemRefs.current[idx] = el; }}
                  onClick={() => handleSelect(idx)}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-t border-border px-4 py-2 text-sm transition-colors",
                    idx === highlightedIdx
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Add repository...</span>
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
