import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
import { ArrowUpDown, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, Loader2, Star, Copy, Check, ChevronDown, Layers } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { StateBadge } from "./StateBadge";
import { PRSizeBadge } from "./PRSizeBadge";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { MergeButton } from "./MergeButton";
import { ReviewerAssign } from "./ReviewerAssign";
import { formatSinglePR, formatPRs, copyToClipboard, type CopyGrouping } from "@/lib/clipboard";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVimStore } from "@/stores/vimStore";
import type { PageDirection, PaginationState } from "@/stores/prStore";

/** Common default branch names — PRs targeting these are NOT considered stacked. */
const DEFAULT_BRANCHES = new Set(["main", "master", "develop", "development"]);

const PAGE_SIZE_OPTIONS = [10, 15, 20, 25] as const;

interface PRTableProps {
  data: github.PullRequest[];
  isLoading: boolean;
  emptyMessage?: string;
  showAuthor?: boolean;
  showMerge?: boolean;
  showAssignReviewer?: boolean;
  onRefresh?: () => void;
  /** Server-side pagination state from the store */
  pagination: PaginationState;
  /** Called when the user clicks first/prev/next */
  onPageChange: (direction: PageDirection) => void;
  /** Called when the user changes the page size selector */
  onPageSizeChange?: (size: number) => void;
  /** Set of priority user/team names. Matching rows get a visual indicator. */
  priorityNames?: Set<string>;
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
  showMerge = false,
  showAssignReviewer = false,
  onRefresh,
  pagination,
  onPageChange,
  onPageSizeChange,
  priorityNames,
}: PRTableProps) {
  const navigate = useNavigate();
  const globalHideStacked = useSettingsStore((s) => s.hideStackedPRs);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [localHideStacked, setLocalHideStacked] = useState<boolean | null>(null);
  const hideStacked = localHideStacked ?? globalHideStacked;
  const { copiedKey, flash } = useCopyFeedback();
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const selectedIndex = useVimStore((s) => s.selectedIndex);

  // Filter out stacked PRs (baseRef not main/master) when toggle is on.
  const filteredData = useMemo(
    () =>
      hideStacked
        ? data.filter((pr) => DEFAULT_BRANCHES.has(pr.baseRef))
        : data,
    [data, hideStacked],
  );

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
    const vim = useVimStore.getState();
    const getRows = () => tableRowsRef.current;

    vim.registerActions({
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
    });

    return () => useVimStore.getState().clearActions();
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
      columnHelper.accessor(
        (row) => `${row.repoOwner}/${row.repoName}`,
        {
          id: "repo",
          header: "Repo",
          cell: (info) => (
            <span className="text-xs text-muted-foreground">{info.getValue()}</span>
          ),
          size: 160,
        }
      ),
      columnHelper.accessor("number", {
        header: "#",
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">
            #{info.getValue()}
          </span>
        ),
        size: 60,
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
          <StateBadge state={info.getValue()} isDraft={info.row.original.isDraft} />
        ),
        size: 90,
      }),
      columnHelper.accessor(
        (row) => row.additions + row.deletions,
        {
          id: "size",
          header: "Size",
          cell: (info) => (
            <PRSizeBadge
              additions={info.row.original.additions}
              deletions={info.row.original.deletions}
            />
          ),
          size: 60,
        }
      ),
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
      columnHelper.display({
        id: "reviewers",
        header: "Reviewers",
        cell: (info) => {
          const requests = info.row.original.reviewRequests;
          if (!requests || requests.length === 0) {
            return <span className="text-xs text-muted-foreground">-</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {requests.slice(0, 3).map((rr, i) => (
                <span
                  key={i}
                  className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                >
                  {rr.reviewer}
                </span>
              ))}
              {requests.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{requests.length - 3}
                </span>
              )}
            </div>
          );
        },
        size: 180,
      }),
      columnHelper.accessor("updatedAt", {
        header: "Updated",
        cell: (info) => (
          <span className="text-xs text-muted-foreground">
            {timeAgo(info.getValue())}
          </span>
        ),
        size: 80,
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => {
          const pr = info.row.original;
          const justCopied = copiedKey === pr.nodeId;
          return (
            <div className="flex items-center gap-0.5">
              {showAssignReviewer && pr.state === "OPEN" && (
                <ReviewerAssign
                  prNodeId={pr.nodeId}
                  currentReviewers={(pr.reviewRequests || []).map(
                    (rr) => rr.reviewer
                  )}
                  onAssigned={onRefresh}
                />
              )}
              {showMerge && (
                <MergeButton
                  prNodeId={pr.nodeId}
                  mergeable={pr.mergeable}
                  state={pr.state}
                  isDraft={pr.isDraft}
                  onMerged={onRefresh}
                />
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
              <button
                onClick={() => BrowserOpenURL(pr.url)}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                title="Open in GitHub"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
        size: (showMerge ? 30 : 0) + (showAssignReviewer ? 30 : 0) + 70,
      }),
    ];
  }, [showAuthor, showMerge, showAssignReviewer, onRefresh, copiedKey, handleCopyRow]);

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
  const visibleRows = table.getRowModel().rows;
  const visiblePRs = useMemo(() => visibleRows.map((r) => r.original), [visibleRows]);
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
    <div className="space-y-3">
      {/* Toolbar: search + copy dropdown */}
      <div className="flex items-center gap-2">
        <input
          ref={searchInputRef}
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
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

      {/* Table */}
      <div className="rounded-md border border-border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
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
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  Loading...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => {
                const pr = row.original;
                const isPriority = priorityNames && priorityNames.size > 0 && (
                  priorityNames.has(pr.author) ||
                  (pr.reviewRequests || []).some((rr) => priorityNames.has(rr.reviewer))
                );
                const isVimSelected = rowIndex === selectedIndex;
                return (
                  <tr
                    key={row.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(rowIndex, el);
                      else rowRefs.current.delete(rowIndex);
                    }}
                    onClick={() => navigate(`/pr/${pr.nodeId}`)}
                    className={`cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/30 ${isVimSelected ? "ring-1 ring-primary bg-accent/40" : ""}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-3 py-2"
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {!isLoading && filteredData.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <select
              value={pagination.pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
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
