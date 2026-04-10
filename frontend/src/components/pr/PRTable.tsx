import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { github } from "../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, Loader2, Star, Copy, Check, ChevronDown, Layers, X, PenLine, CheckCircle2, Users, GitMerge } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { StateBadge } from "./StateBadge";
import { PRSizeBadge } from "./PRSizeBadge";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { ChecksStatusIcon } from "./ChecksStatusIcon";

import { formatSinglePR, formatPRs, copyToClipboard, type CopyGrouping } from "@/lib/clipboard";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVimStore, registerActions, clearActions } from "@/stores/vimStore";
import type { PageDirection, PaginationState } from "@/stores/prStore";

/** Common default branch names — PRs targeting these are NOT considered stacked. */
const DEFAULT_BRANCHES = new Set(["main", "master", "develop", "development"]);

/** Estimate review time based on PR complexity (lines changed + file count). */
function estimateReviewTime(pr: github.PullRequest): string {
  const score = pr.additions + pr.deletions + (pr.changedFiles || 0) * 20;
  if (score < 50) return "~2m";
  if (score < 200) return "~10m";
  if (score < 500) return "~20m";
  if (score < 1000) return "~30m";
  return "~1h+";
}

/** Return a Tailwind color class based on how stale the timestamp is. */
function stalenessColor(date: string | Date | number): string {
  const days = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (days > 14) return "text-red-500 dark:text-red-400";
  if (days > 7) return "text-orange-500 dark:text-orange-400";
  if (days > 3) return "text-yellow-600 dark:text-yellow-400";
  return "text-muted-foreground";
}

const PAGE_SIZE_OPTIONS = [10, 15, 20, 25] as const;

interface PRTableProps {
  data: github.PullRequest[];
  isLoading: boolean;
  emptyMessage?: string;
  showAuthor?: boolean;
  onRefresh?: () => void;
  /** Server-side pagination state from the store */
  pagination: PaginationState;
  /** Called when the user clicks first/prev/next */
  onPageChange: (direction: PageDirection) => void;
  /** Called when the user changes the page size selector */
  onPageSizeChange?: (size: number) => void;
  /** Set of priority user/team names. Matching rows get a visual indicator. */
  priorityNames?: Set<string>;
  /** Called when the user hides/dismisses a PR (by nodeId). */
  onHide?: (nodeId: string) => void;
  /** Set of hidden PR nodeIds — filtered out before display. */
  hiddenPRs?: Set<string>;
  /** Called when client-side filters reduce visible rows below page size and more data is available. */
  onFetchMore?: () => void;
  /** Current user's GitHub login — enables the "hide approved by me" filter. */
  viewerLogin?: string;
  /** Set of PR nodeIds that match flag rules — shown with a red border. */
  flaggedNodeIds?: Set<string>;
  /** In-page tab direct handler (e.g. 1/2 to switch Open/Merged tabs). */
  onTabDirect?: ((index: number) => void) | null;
  /** Map of PR nodeId → list of flag reason strings. When provided, a "Reason" column is shown. */
  flagReasons?: Map<string, string[]>;
  /** Which timestamp field to display in the time column. Defaults to "updatedAt". */
  timestampField?: "updatedAt" | "mergedAt";
  /** Authenticated user's teams — when provided, rows are grouped by team with separator headers. */
  viewerTeams?: { slug: string; name: string }[];
  /** Called when the user clicks the quick-merge button on a PR row. */
  onMerge?: (prNodeId: string) => Promise<void>;
}

const columnHelper = createColumnHelper<github.PullRequest>();

/** Small hook: shows a transient "copied" state for a given key. */
function useCopyFeedback(timeoutMs = 1500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback((key: string) => {
    clearTimeout(timer.current);
    setCopiedKey(key);
    timer.current = setTimeout(() => setCopiedKey(null), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { copiedKey, flash };
}

export function PRTable({
  data,
  isLoading,
  emptyMessage = "No pull requests found.",
  showAuthor = false,
  onRefresh,
  pagination,
  onPageChange,
  onPageSizeChange,
  priorityNames,
  onHide,
  hiddenPRs,
  onFetchMore,
  viewerLogin,
  flaggedNodeIds,
  onTabDirect,
  flagReasons,
  timestampField = "updatedAt",
  viewerTeams,
  onMerge,
}: PRTableProps) {
  const navigate = useNavigate();
  const globalHideStacked = useSettingsStore((s) => s.hideStackedPRs);
  const globalHideDrafts = useSettingsStore((s) => s.hideDraftPRs);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [localHideStacked, setLocalHideStacked] = useState<boolean | null>(null);
  const [localHideDrafts, setLocalHideDrafts] = useState<boolean | null>(null);
  const [hideApproved, setHideApproved] = useState(false);
  const hideStacked = localHideStacked ?? globalHideStacked;
  const hideDrafts = localHideDrafts ?? globalHideDrafts;
  const { copiedKey, flash } = useCopyFeedback();
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const selectedIndex = useVimStore((s) => s.selectedIndex);
  const visualMode = useVimStore((s) => s.visualMode);
  const visualAnchor = useVimStore((s) => s.visualAnchor);
  const pickedIndices = useVimStore((s) => s.pickedIndices);

  // Filter out stacked PRs, draft PRs, and hidden PRs.
  const filteredData = useMemo(() => {
    let result = data;
    if (hideStacked) {
      result = result.filter((pr) => DEFAULT_BRANCHES.has(pr.baseRef));
    }
    if (hideDrafts) {
      result = result.filter((pr) => !pr.isDraft);
    }
    if (hiddenPRs && hiddenPRs.size > 0) {
      result = result.filter((pr) => !hiddenPRs.has(pr.nodeId));
    }
    if (hideApproved && viewerLogin) {
      result = result.filter((pr) =>
        !pr.reviews?.some((r) => r.author === viewerLogin && r.state === "APPROVED"),
      );
    }
    return result;
  }, [data, hideStacked, hideDrafts, hiddenPRs, hideApproved, viewerLogin]);

  // Detect stacked PRs (baseRef is not a default branch).
  const stackedPRs = useMemo(() => {
    const stacked = new Map<string, string>();
    for (const pr of filteredData) {
      if (!DEFAULT_BRANCHES.has(pr.baseRef)) {
        stacked.set(pr.nodeId, pr.baseRef);
      }
    }
    return stacked;
  }, [filteredData]);

  // Auto-fill: when filtering reduces visible rows below page size and the
  // server has more pages, request additional items to fill the table.
  const anyFilterActive = hideStacked || hideDrafts || hideApproved || (hiddenPRs && hiddenPRs.size > 0);
  useEffect(() => {
    if (
      anyFilterActive &&
      !isLoading &&
      onFetchMore &&
      pagination.hasNextPage &&
      filteredData.length < pagination.pageSize &&
      data.length > 0
    ) {
      onFetchMore();
    }
  }, [anyFilterActive, filteredData.length, pagination.pageSize, pagination.hasNextPage, isLoading, data.length, onFetchMore]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!copyMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) {
        setCopyMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [copyMenuOpen]);

  // ---- VIM navigation integration ----
  // We use the table's visible (filtered+sorted) rows for vim navigation.
  // `tableRows` is set after the table is built (below) and then used by
  // the registration effect, so we capture it in a ref that updates each render.
  const tableRowsRef = useRef<github.PullRequest[]>([]);

  // Register vim actions — runs on every render so callbacks close over fresh data.
  useEffect(() => {
    const getRows = () => tableRowsRef.current;

    registerActions({
      onOpen: (index: number) => {
        const pr = getRows()[index];
        if (pr) navigate(`/pr/${pr.nodeId}`);
      },
      onOpenExternal: (index: number) => {
        const pr = getRows()[index];
        if (pr) BrowserOpenURL(pr.url);
      },
      onRefresh: onRefresh || null,
      onNextPage: pagination.hasNextPage ? () => onPageChange("next") : null,
      onPrevPage: pagination.currentPage > 1 ? () => onPageChange("prev") : null,
      onFocusSearch: () => searchInputRef.current?.focus(),
      onCopy: () => handleCopySelection(),
      onHide: onHide ? (index: number) => {
        const pr = getRows()[index];
        if (pr) onHide(pr.nodeId);
      } : null,
      onToggleDrafts: () => setLocalHideDrafts((prev) => !(prev ?? globalHideDrafts)),
      onToggleStacked: () => setLocalHideStacked((prev) => !(prev ?? globalHideStacked)),
      onToggleApproved: viewerLogin ? () => setHideApproved((prev) => !prev) : null,
      onTabDirect: onTabDirect || null,
    });

    return () => clearActions();
  }); // intentionally no deps — re-registers each render with fresh closures

  // Auto-scroll the selected row into view.
  useEffect(() => {
    if (selectedIndex < 0) return;
    const row = rowRefs.current.get(selectedIndex);
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  const handleCopyRow = useCallback(
    async (pr: github.PullRequest) => {
      const text = formatSinglePR(pr);
      const ok = await copyToClipboard(text);
      if (ok) flash(pr.nodeId);
    },
    [flash],
  );

  const handleCopyAll = useCallback(
    async (grouping: CopyGrouping) => {
      setCopyMenuOpen(false);
      const text = formatPRs(filteredData, grouping);
      const ok = await copyToClipboard(text);
      if (ok) flash("__all__");
    },
    [filteredData, flash],
  );

  /** Copy handler for the 'c' keybinding — copies visual range + picked rows (or single cursor row), grouped by repo. */
  const handleCopySelection = useCallback(async () => {
    const vim = useVimStore.getState();
    const rows = tableRowsRef.current;

    // Gather all selected indices (visual range + individually picked).
    const indices = vim.getAllSelectedIndices();

    let prsToCopy: github.PullRequest[];
    if (indices.length > 0) {
      prsToCopy = indices.map((i) => rows[i]).filter(Boolean);
    } else if (vim.selectedIndex >= 0 && rows[vim.selectedIndex]) {
      // Nothing selected via visual/pick — fall back to single cursor row.
      prsToCopy = [rows[vim.selectedIndex]];
    } else {
      return;
    }

    if (prsToCopy.length === 0) return;

    const text = formatPRs(prsToCopy, "repo");
    const ok = await copyToClipboard(text);
    if (ok) flash("__all__");

    // Exit visual mode and clear picks after copying.
    vim.exitVisualMode();
  }, [flash]);

  const columns = useMemo(() => {
    const authorCol = columnHelper.accessor("author", {
      header: "Author",
      cell: (info) => (
        <div className="flex items-center gap-1.5">
          {info.row.original.authorAvatar && (
            <img
              src={info.row.original.authorAvatar}
              className="h-4 w-4 rounded-full"
              alt=""
            />
          )}
          <span className="text-xs text-muted-foreground">
            {info.getValue()}
          </span>
        </div>
      ),
      size: 120,
    });

    return [
      columnHelper.accessor("number", {
        header: "#",
        cell: (info) => {
          const baseRef = stackedPRs.get(info.row.original.nodeId);
          return (
            <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              #{info.getValue()}
              {baseRef && (
                <span title={`Stacked on ${baseRef}`}>
                  <Layers className="h-3 w-3 shrink-0 text-purple-500" />
                </span>
              )}
            </span>
          );
        },
        size: 70,
      }),
      columnHelper.accessor("title", {
        header: "Title",
        cell: (info) => (
          <span className="line-clamp-1 text-sm font-medium" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
        size: 320,
      }),
      ...(showAuthor ? [authorCol] : []),
      columnHelper.accessor("state", {
        header: "State",
        cell: (info) => (
          <StateBadge state={info.getValue()} isDraft={info.row.original.isDraft} isInMergeQueue={info.row.original.isInMergeQueue} />
        ),
        size: 90,
      }),
      columnHelper.accessor(
        (row) => row.additions + row.deletions,
        {
          id: "size",
          header: "Size",
          cell: (info) => (
            <div className="flex items-center gap-1.5">
              <PRSizeBadge
                additions={info.row.original.additions}
                deletions={info.row.original.deletions}
              />
              <span className="text-[10px] text-muted-foreground" title="Estimated review time">
                {estimateReviewTime(info.row.original)}
              </span>
            </div>
          ),
          size: 90,
        }
      ),
      columnHelper.display({
        id: "diff",
        header: "+/-",
        cell: (info) => {
          const { additions, deletions } = info.row.original;
          return (
            <span className="whitespace-nowrap font-mono text-xs">
              <span className="text-green-600 dark:text-green-400">+{additions}</span>
              {" / "}
              <span className="text-red-600 dark:text-red-400">-{deletions}</span>
            </span>
          );
        },
        size: 90,
      }),
      columnHelper.accessor("reviewDecision", {
        header: "Review",
        cell: (info) => <ReviewStatusBadge reviewDecision={info.getValue()} />,
        size: 100,
      }),
      columnHelper.accessor("checksStatus", {
        header: "CI",
        cell: (info) => <ChecksStatusIcon status={info.getValue()} isMerged={info.row.original.state === "MERGED"} />,
        size: 40,
      }),
      columnHelper.accessor(timestampField === "mergedAt" ? "mergedAt" : "updatedAt", {
        header: timestampField === "mergedAt" ? "Merged" : "Updated",
        cell: (info) => {
          const val = info.getValue();
          const color = timestampField === "updatedAt" && val ? stalenessColor(val) : "text-muted-foreground";
          return (
            <span className={`text-xs ${color}`} title={val ? new Date(val).toLocaleString() : undefined}>
              {timeAgo(val)}
            </span>
          );
        },
        size: 80,
      }),
      ...(flagReasons ? [columnHelper.display({
        id: "flagReason",
        header: "Reason",
        cell: (info) => {
          const reasons = flagReasons.get(info.row.original.nodeId);
          if (!reasons || reasons.length === 0) return null;
          return (
            <span className="text-xs text-muted-foreground" title={reasons.join(", ")}>
              {reasons.map((r, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{r}</code>
                </span>
              ))}
            </span>
          );
        },
        size: 150,
      })] : []),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => {
          const pr = info.row.original;
          const justCopied = copiedKey === pr.nodeId;
          const canMerge = onMerge && !pr.isDraft && pr.state === "OPEN" && pr.mergeable === "MERGEABLE"
            && (pr.reviewDecision === "APPROVED" || pr.reviewDecision === "");
          const isMerging = mergingKey === pr.nodeId;
          return (
            <div className="flex items-center gap-0.5">
              {canMerge && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMergingKey(pr.nodeId);
                    try { await onMerge(pr.nodeId); } finally { setMergingKey(null); }
                  }}
                  disabled={isMerging}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-50"
                  title="Squash and merge"
                >
                  {isMerging ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitMerge className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              {onHide && (
                <button
                  onClick={() => onHide(pr.nodeId)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-red-500"
                  title="Hide this PR"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => handleCopyRow(pr)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                title="Copy PR link"
              >
                {justCopied ? (
                  <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          );
        },
        size: (onHide ? 30 : 0) + (onMerge ? 30 : 0) + 40,
      }),
    ];
  }, [showAuthor, onHide, onMerge, copiedKey, mergingKey, handleCopyRow, flagReasons, timestampField, stackedPRs]);

  // No client-side pagination — the table displays exactly what the server sent.
  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Sync visible rows to vim store for j/k navigation.
  const tableRows = table.getRowModel().rows;

  // Group rows by the viewer's teams (based on team review requests on each PR).
  // A PR matching multiple teams gets a comma-separated header (e.g. "Team A, Team B").
  // Also checks reviews — if a PR has a review from the viewer but no team in
  // reviewRequests (fulfilled request), it's placed under the first viewer team.
  const { orderedRows, teamSeparators } = useMemo(() => {
    if (!viewerTeams || viewerTeams.length === 0) {
      return { orderedRows: tableRows, teamSeparators: new Map<number, string>() };
    }

    const teamSlugs = new Set(viewerTeams.map((t) => t.slug));
    const slugToName = new Map(viewerTeams.map((t) => [t.slug, t.name]));

    // Bucket key is a sorted comma-separated list of team slugs.
    const buckets = new Map<string, typeof tableRows>();
    const bucketLabels = new Map<string, string>();
    const ungrouped: typeof tableRows = [];

    for (const row of tableRows) {
      const pr = row.original;
      // Find ALL matching team review requests.
      const matches = (pr.reviewRequests || []).filter(
        (rr) => rr.reviewerType === "team" && teamSlugs.has(rr.reviewer),
      );

      let teamKey: string;
      let teamLabel: string;

      if (matches.length > 0) {
        const slugs = matches.map((m) => m.reviewer).sort();
        teamKey = slugs.join(",");
        teamLabel = slugs.map((s) => slugToName.get(s) || s).join(", ");
      } else if (viewerLogin && (pr.reviews || []).some((r) => r.author === viewerLogin)) {
        // Fallback: viewer reviewed this PR but team request was fulfilled.
        teamKey = viewerTeams[0].slug;
        teamLabel = viewerTeams[0].name;
      } else {
        ungrouped.push(row);
        continue;
      }

      if (!buckets.has(teamKey)) {
        buckets.set(teamKey, []);
        bucketLabels.set(teamKey, teamLabel);
      }
      buckets.get(teamKey)!.push(row);
    }

    if (buckets.size === 0) {
      return { orderedRows: tableRows, teamSeparators: new Map<number, string>() };
    }

    // Order: priority teams first, then remaining single-team buckets (in viewerTeams order),
    // then multi-team combos, then "Other".
    const result: typeof tableRows = [];
    const separators = new Map<number, string>();
    const usedKeys = new Set<string>();

    // Priority teams first.
    if (priorityNames && priorityNames.size > 0) {
      for (const team of viewerTeams) {
        if (!priorityNames.has(team.slug) && !priorityNames.has(team.name)) continue;
        const bucket = buckets.get(team.slug);
        if (bucket && bucket.length > 0) {
          separators.set(result.length, team.name);
          result.push(...bucket);
          usedKeys.add(team.slug);
        }
      }
    }

    // Remaining single-team buckets.
    for (const team of viewerTeams) {
      if (usedKeys.has(team.slug)) continue;
      const bucket = buckets.get(team.slug);
      if (bucket && bucket.length > 0) {
        separators.set(result.length, team.name);
        result.push(...bucket);
        usedKeys.add(team.slug);
      }
    }

    // Multi-team combos.
    for (const [key, bucket] of buckets) {
      if (usedKeys.has(key) || bucket.length === 0) continue;
      separators.set(result.length, bucketLabels.get(key) || key);
      result.push(...bucket);
    }

    if (ungrouped.length > 0) {
      separators.set(result.length, "Other");
      result.push(...ungrouped);
    }

    return { orderedRows: result, teamSeparators: separators };
  }, [tableRows, viewerTeams, viewerLogin, priorityNames]);

  const visiblePRs = useMemo(() => orderedRows.map((r) => r.original), [orderedRows]);
  tableRowsRef.current = visiblePRs;

  useEffect(() => {
    useVimStore.getState().setListLength(visiblePRs.length);
  }, [visiblePRs.length]);

  const totalPages = pagination.totalCount > 0
    ? Math.ceil(pagination.totalCount / pagination.pageSize)
    : 1;
  const onFirstPage = pagination.currentPage <= 1;
  const onLastPage = !pagination.hasNextPage;

  return (
    <div className="space-y-2">
      {/* Toolbar: search + copy dropdown */}
      <div className="flex items-center gap-2">
        <input
          ref={searchInputRef}
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              searchInputRef.current?.blur();
            }
          }}
          placeholder="Filter pull requests..."
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => setLocalHideStacked((prev) => !(prev ?? globalHideStacked))}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            hideStacked
              ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
          title={hideStacked ? "Showing non-stacked PRs only (click to show all)" : "Showing all PRs (click to hide stacked)"}
        >
          <Layers className="h-3.5 w-3.5" />
          {hideStacked ? "Stacked hidden" : "Show all"}
        </button>
        <button
          onClick={() => setLocalHideDrafts((prev) => !(prev ?? globalHideDrafts))}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            hideDrafts
              ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
          title={hideDrafts ? "Draft PRs hidden (click to show)" : "Showing all PRs (click to hide drafts)"}
        >
          <PenLine className="h-3.5 w-3.5" />
          {hideDrafts ? "Drafts hidden" : "Drafts"}
        </button>
        {viewerLogin && (
          <button
            onClick={() => setHideApproved((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              hideApproved
                ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            title={hideApproved ? "Approved PRs hidden (click to show)" : "Showing all PRs (click to hide approved by me)"}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {hideApproved ? "Approved hidden" : "Approved"}
          </button>
        )}
        {data.length > 0 && (
          <div className="relative" ref={copyMenuRef}>
            <button
              onClick={() => setCopyMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Copy PRs to clipboard"
            >
              {copiedKey === "__all__" ? (
                <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-300" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy
              <ChevronDown className="h-3 w-3" />
            </button>
            {copyMenuOpen && (
              <div className="absolute right-0 z-50 mt-1 w-44 rounded-md border border-border bg-popover py-1 shadow-md">
                <button
                  onClick={() => handleCopyAll("none")}
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
                >
                  No grouping
                </button>
                <button
                  onClick={() => handleCopyAll("repo")}
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
                >
                  Group by repo
                </button>
                <button
                  onClick={() => handleCopyAll("size")}
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent"
                >
                  Group by size
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection indicator (visual range and/or picked rows) */}
      {(() => {
        // Compute total selected count (union of visual range + picks).
        const allIndices = new Set<number>(pickedIndices);
        if (visualMode && visualAnchor >= 0 && selectedIndex >= 0) {
          const lo = Math.min(visualAnchor, selectedIndex);
          const hi = Math.max(visualAnchor, selectedIndex);
          for (let i = lo; i <= hi; i++) allIndices.add(i);
        }
        const count = allIndices.size;
        if (count === 0) return null;
        const modeLabel = visualMode ? "VISUAL" : "SELECT";
        return (
          <div className="flex items-center gap-2 rounded-md border border-blue-500/50 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-300">
            <span className="font-medium">{modeLabel}</span>
            <span className="text-blue-500/70 dark:text-blue-400/70">
              {count} row{count !== 1 ? "s" : ""} selected
            </span>
            <span className="ml-auto text-blue-500/50 dark:text-blue-400/50">
              <kbd className="rounded bg-blue-500/15 px-1 py-0.5 font-mono text-[10px]">c</kbd> copy
              <span className="mx-1.5">&middot;</span>
              <kbd className="rounded bg-blue-500/15 px-1 py-0.5 font-mono text-[10px]">Esc</kbd> cancel
            </span>
          </div>
        );
      })()}

      {/* Table */}
      <div className="rounded-md border border-border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? "flex cursor-pointer select-none items-center gap-1"
                            : ""
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading && filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Loading...
                </td>
              </tr>
            ) : orderedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              orderedRows.map((row, rowIndex) => {
                const pr = row.original;
                const isPriority = priorityNames && priorityNames.size > 0 && (
                  priorityNames.has(pr.author) ||
                  (pr.reviewRequests || []).some((rr) => priorityNames.has(rr.reviewer))
                );
                const isVimSelected = rowIndex === selectedIndex;
                const isInVisualRange = visualMode && visualAnchor >= 0 && selectedIndex >= 0
                  && rowIndex >= Math.min(visualAnchor, selectedIndex)
                  && rowIndex <= Math.max(visualAnchor, selectedIndex);
                const isPicked = pickedIndices.has(rowIndex);
                const isHighlighted = isInVisualRange || isPicked;
                const isFlagged = flaggedNodeIds?.has(pr.nodeId) ?? false;
                const teamLabel = teamSeparators.get(rowIndex);
                return (
                  <Fragment key={row.id}>
                    {teamLabel && (
                      <tr className="border-b border-border bg-muted/40">
                        <td
                          colSpan={columns.length}
                          className="px-3 py-1.5"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            {teamLabel}
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      ref={(el) => {
                        if (el) rowRefs.current.set(rowIndex, el);
                        else rowRefs.current.delete(rowIndex);
                      }}
                      onClick={() => navigate(`/pr/${pr.nodeId}`)}
                      className={`cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/30 ${
                        isHighlighted
                          ? "ring-1 ring-blue-500 bg-blue-500/15"
                          : isVimSelected
                            ? "ring-1 ring-primary bg-accent/40"
                            : isFlagged
                              ? "ring-1 ring-destructive/60 bg-destructive/5"
                              : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-1.5"
                          onClick={
                            cell.column.id === "actions"
                              ? (e) => e.stopPropagation()
                              : undefined
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            {isPriority && cell === row.getVisibleCells()[0] && (
                              <Star className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />
                            )}
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {!isLoading && filteredData.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Rows</span>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => onPageSizeChange?.(size)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  pagination.pageSize === size
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="mr-2 text-xs text-muted-foreground">
              Page {pagination.currentPage} of {totalPages}
              {pagination.totalCount > 0 && (
                <> &middot; {pagination.totalCount} total</>
              )}
              {isLoading && (
                <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
              )}
            </span>
            <button
              onClick={() => onPageChange("first")}
              disabled={onFirstPage || isLoading}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange("prev")}
              disabled={onFirstPage || isLoading}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange("next")}
              disabled={onLastPage || isLoading}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
