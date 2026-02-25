import { useState, useMemo } from "react";
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
import { ArrowUpDown, ExternalLink } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { StateBadge } from "./StateBadge";
import { PRSizeBadge } from "./PRSizeBadge";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { ChecksStatusIcon } from "./ChecksStatusIcon";
import { MergeButton } from "./MergeButton";

interface PRTableProps {
  data: github.PullRequest[];
  isLoading: boolean;
  emptyMessage?: string;
  showAuthor?: boolean;
  showMerge?: boolean;
  onRefresh?: () => void;
}

const columnHelper = createColumnHelper<github.PullRequest>();

export function PRTable({
  data,
  isLoading,
  emptyMessage = "No pull requests found.",
  showAuthor = false,
  showMerge = false,
  onRefresh,
}: PRTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

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
        size: showMerge ? 70 : 40,
      }),
    ];
  }, [showAuthor, showMerge, onRefresh]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

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
            {isLoading ? (
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
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Row count */}
      {!isLoading && data.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} of {data.length} pull request{data.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
