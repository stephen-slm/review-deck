import { useMemo } from "react";
import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useFlagStore } from "@/stores/flagStore";
import { PRTable } from "@/components/pr/PRTable";
import { AlertCircle, AlertTriangle } from "lucide-react";
import type { PaginationState } from "@/stores/prStore";

/**
 * Aggregates flagged PRs from Review Requests + Reviewed By Me,
 * deduplicates by nodeId, and displays them in a single PRTable.
 */
export function FlaggedPRsPage() {
  const { isAuthenticated } = useAuthStore();
  const reviewRequestItems = usePRStore((s) => s.pages.reviewRequests.items);
  const reviewedByMeItems = usePRStore((s) => s.pages.reviewedByMe.items);
  const isFlagged = useFlagStore((s) => s.isFlagged);
  const rules = useFlagStore((s) => s.rules);

  // Merge + deduplicate + filter to flagged only.
  const flaggedItems = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...reviewRequestItems, ...reviewedByMeItems];
    const deduped = merged.filter((pr) => {
      if (seen.has(pr.nodeId)) return false;
      seen.add(pr.nodeId);
      return true;
    });
    return deduped.filter((pr) => isFlagged(pr));
  }, [reviewRequestItems, reviewedByMeItems, isFlagged, rules]);

  // Build a set of all flagged nodeIds for red border styling.
  const flaggedNodeIds = useMemo(
    () => new Set(flaggedItems.map((pr) => pr.nodeId)),
    [flaggedItems],
  );

  // Fake client-side pagination state — show everything on one page.
  const pagination: PaginationState = useMemo(
    () => ({
      items: flaggedItems,
      currentPage: 1,
      pageSize: flaggedItems.length || 10,
      totalCount: flaggedItems.length,
      hasNextPage: false,
      endCursor: "",
      cursorStack: [""],
      pageCache: {},
    }),
    [flaggedItems],
  );

  const enabledRuleCount = rules.filter((r) => r.enabled).length;

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Flagged PRs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull requests matching your flag rules ({enabledRuleCount} active rule{enabledRuleCount !== 1 ? "s" : ""}).
          </p>
        </div>
      </div>

      {enabledRuleCount === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            No flag rules are enabled. Add rules in Settings to start flagging PRs.
          </span>
        </div>
      )}

      <PRTable
        data={flaggedItems}
        isLoading={false}
        showAuthor
        emptyMessage="No flagged pull requests."
        pagination={pagination}
        onPageChange={() => {}}
        flaggedNodeIds={flaggedNodeIds}
      />
    </div>
  );
}
