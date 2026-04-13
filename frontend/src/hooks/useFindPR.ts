import { useMemo } from "react";
import { usePRStore } from "@/stores/prStore";
import { github } from "../../wailsjs/go/models";
import { dlog } from "@/lib/debugLog";

/** Search all PR store arrays for a PR by nodeId.
 *
 *  Performs a one-time imperative read of the store (no Zustand subscription).
 *  The PR detail page fetches its own copy independently, so this lookup is
 *  only needed for the initial render before the fetch completes.
 *
 *  A reactive subscription here caused React error #185: background fetches
 *  (poller, fetchIfStale) resolving during the detail page's render cycle
 *  triggered useSyncExternalStore tearing checks, cascading past React's
 *  50-update nested limit.
 */
export function useFindPR(nodeId: string | undefined): github.PullRequest | undefined {
  return useMemo(() => {
    dlog("useFindPR", `nodeId=${nodeId}`);
    if (!nodeId) return undefined;
    const p = usePRStore.getState().pages;
    const all = [
      ...p.myPRs.items,
      ...p.myRecentMerged.items,
      ...p.reviewRequests.items,
      ...p.teamReviewRequests.items,
      ...p.reviewedByMe.items,
    ];
    const found = all.find((pr) => pr.nodeId === nodeId);
    dlog("useFindPR", `found=${!!found}`);
    return found;
  }, [nodeId]);
}
