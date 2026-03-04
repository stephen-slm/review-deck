import { useMemo } from "react";
import { usePRStore } from "@/stores/prStore";
import { github } from "../../wailsjs/go/models";

/** Search all PR store arrays for a PR by nodeId.
 *  Derives a stable cache key so the expensive lookup only re-runs when page
 *  data actually changes in a meaningful way.
 */
export function useFindPR(nodeId: string | undefined): github.PullRequest | undefined {
  // Subscribe to a lightweight fingerprint instead of the full `pages` object.
  // This prevents re-renders when unrelated store fields change.
  const fingerprint = usePRStore((s) => {
    const p = s.pages;
    return `${p.myPRs.currentPage}-${p.myPRs.items.length}|` +
      `${p.myRecentMerged.currentPage}-${p.myRecentMerged.items.length}|` +
      `${p.reviewRequests.currentPage}-${p.reviewRequests.items.length}|` +
      `${p.teamReviewRequests.currentPage}-${p.teamReviewRequests.items.length}|` +
      `${p.reviewedByMe.currentPage}-${p.reviewedByMe.items.length}`;
  });

  return useMemo(() => {
    if (!nodeId) return undefined;
    const p = usePRStore.getState().pages;
    const all = [
      ...p.myPRs.items,
      ...p.myRecentMerged.items,
      ...p.reviewRequests.items,
      ...p.teamReviewRequests.items,
      ...p.reviewedByMe.items,
    ];
    return all.find((pr) => pr.nodeId === nodeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, fingerprint]);
}
