import { useMemo, useRef } from "react";
import { usePRStore } from "@/stores/prStore";
import { github } from "../../wailsjs/go/models";

/** Search all PR store arrays for a PR by nodeId.
 *  Derives a stable cache key so the expensive lookup only re-runs when page
 *  data actually changes in a meaningful way.
 *
 *  Returns a stable reference: if the found PR has the same nodeId + updatedAt
 *  as the previous result, the old reference is reused to prevent downstream
 *  re-renders from object identity changes.
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

  const prevRef = useRef<github.PullRequest | undefined>(undefined);

  return useMemo(() => {
    if (!nodeId) {
      prevRef.current = undefined;
      return undefined;
    }
    const p = usePRStore.getState().pages;
    const all = [
      ...p.myPRs.items,
      ...p.myRecentMerged.items,
      ...p.reviewRequests.items,
      ...p.teamReviewRequests.items,
      ...p.reviewedByMe.items,
    ];
    const found = all.find((pr) => pr.nodeId === nodeId);

    // Return the previous reference if the PR hasn't materially changed.
    // This prevents unnecessary re-renders when the poller replaces the
    // store arrays with new object references but the data is identical.
    const prev = prevRef.current;
    if (prev && found && prev.nodeId === found.nodeId && prev.updatedAt === found.updatedAt) {
      return prev;
    }

    prevRef.current = found;
    return found;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, fingerprint]);
}
