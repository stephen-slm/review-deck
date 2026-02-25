import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type PaginationState,
} from "@tanstack/react-table";
import { github } from "../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { ArrowUpDown, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, Loader2, Star } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { StateBadge } from "./StateBadge";
import { PRSizeBadge } from "./PRSizeBadge";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { MergeButton } from "./MergeButton";
import { ReviewerAssign } from "./ReviewerAssign";

const PAGE_SIZE_OPTIONS = [10, 15, 20, 25] as const;

interface ServerPageInfo {
  hasNextPage: boolean;
  totalCount: number;
}

interface PRTableProps {
  data: github.PullRequest[];
  isLoading: boolean;
  emptyMessage?: string;
  showAuthor?: boolean;
  showMerge?: boolean;
  showAssignReviewer?: boolean;
  onRefresh?: () => void;
  defaultPageSize?: number;
  /** Server-side pagination info. When provided, the table shows total count and a "Load more" trigger. */
  serverPageInfo?: ServerPageInfo;
  /** Called when the user navigates past the currently loaded data and more server pages exist. */
  onLoadMore?: () => void;
  /** Set of priority user/team names. Matching rows get a visual indicator. */
  priorityNames?: Set<string>;
}

const columnHelper = createColumnHelper<github.PullRequest>();

export function PRTable({
  data,
  isLoading,
  emptyMessage = "No pull requests found.",
  showAuthor = false,
  showMerge = false,
  showAssignReviewer = false,
  onRefresh,
  defaultPageSize = 10,
  serverPageInfo,
  onLoadMore,
  priorityNames,
}: PRTableProps) {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

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
        cell: (info) => <ChecksStatusIcon status={info.getValue()} />,
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
        cell: (info) => (
          <div className="flex items-center gap-0.5">
            {showAssignReviewer && info.row.original.state === "OPEN" && (
              <ReviewerAssign
                prNodeId={info.row.original.nodeId}
                currentReviewers={(info.row.original.reviewRequests || []).map(
                  (rr) => rr.reviewer
                )}
                onAssigned={onRefresh}
              />
            )}
            {showMerge && (
              <MergeButton
                prNodeId={info.row.original.nodeId}
                mergeable={info.row.original.mergeable}
                state={info.row.original.state}
                isDraft={info.row.original.isDraft}
                onMerged={onRefresh}
              />
            )}
            <button
              onClick={() => BrowserOpenURL(info.row.original.url)}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              title="Open in GitHub"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        size: (showMerge ? 30 : 0) + (showAssignReviewer ? 30 : 0) + 40,
      }),
    ];
  }, [showAuthor, showMerge, showAssignReviewer, onRefresh]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Determine if the user is on the last client page and more server data is available.
  const isOnLastClientPage = !table.getCanNextPage();
  const canLoadMore = !!serverPageInfo?.hasNextPage && !!onLoadMore;
  const totalCount = serverPageInfo?.totalCount ?? data.length;

  // Handle "next": if at the end of client data and server has more, load more first.
  const handleNext = () => {
    if (isOnLastClientPage && canLoadMore) {
      onLoadMore!();
    } else {
      table.nextPage();
    }
  };

  // Can go forward if TanStack has more pages OR if the server has more data to fetch.
  const canGoNext = table.getCanNextPage() || canLoadMore;

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <input
        type="text"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Filter pull requests..."
        className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />

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
            {isLoading && data.length === 0 ? (
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
              table.getRowModel().rows.map((row) => {
                const pr = row.original;
                const isPriority = priorityNames && priorityNames.size > 0 && (
                  priorityNames.has(pr.author) ||
                  (pr.reviewRequests || []).some((rr) => priorityNames.has(rr.reviewer))
                );
                return (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/pr/${pr.nodeId}`)}
                    className={`cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/30 ${isPriority ? "border-l-2 border-l-yellow-500 bg-yellow-500/5" : ""}`}
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
      {!isLoading && data.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <select
              value={pagination.pageSize}
              onChange={(e) =>
                setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
              }
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
              {data.length} loaded{totalCount > data.length ? ` of ${totalCount}` : ""}
              {" "}&middot; Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount() || 1}
              {isLoading && (
                <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
              )}
            </span>
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNext}
              disabled={!canGoNext || isLoading}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
              title={isOnLastClientPage && canLoadMore ? "Load more from GitHub" : "Next page"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
