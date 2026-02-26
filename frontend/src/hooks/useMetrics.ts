import { useState, useEffect, useMemo } from "react";
import { GetMetricsHistory } from "../../wailsjs/go/services/PullRequestService";
import { storage } from "../../wailsjs/go/models";
import { usePRStore, getAllItems } from "@/stores/prStore";
import { github } from "../../wailsjs/go/models";

// ---- Size thresholds ----

type SizeLabel = "XS" | "S" | "M" | "L" | "XL";

function prSizeLabel(additions: number, deletions: number): SizeLabel {
  const total = additions + deletions;
  if (total < 10) return "XS";
  if (total < 50) return "S";
  if (total < 250) return "M";
  if (total < 1000) return "L";
  return "XL";
}

// ---- Age helpers ----

function hoursSince(date: string | Date): number {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

function daysSince(date: string | Date): number {
  return hoursSince(date) / 24;
}

export type AgeBucket = "<1d" | "1-3d" | "3-7d" | "1-2w" | "2w+";

function ageBucket(date: string | Date): AgeBucket {
  const d = daysSince(date);
  if (d < 1) return "<1d";
  if (d < 3) return "1-3d";
  if (d < 7) return "3-7d";
  if (d < 14) return "1-2w";
  return "2w+";
}

// ---- Attention flags ----

export interface AttentionItem {
  pr: github.PullRequest;
  reasons: string[];
}

function computeAttention(prs: github.PullRequest[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const pr of prs) {
    const reasons: string[] = [];
    if (pr.mergeable === "CONFLICTING") reasons.push("Conflicts");
    if (pr.checksStatus === "FAILURE" || pr.checksStatus === "ERROR") reasons.push("CI failure");
    if (pr.reviewDecision === "CHANGES_REQUESTED") reasons.push("Changes requested");
    if (daysSince(pr.updatedAt) > 7) reasons.push("Stale >7d");
    if (reasons.length > 0) items.push({ pr, reasons });
  }
  return items;
}

// ---- Merge velocity ----

export interface DayBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

function computeMergeVelocity(merged: github.PullRequest[]): DayBucket[] {
  // Build a map of date -> count for the last 14 days.
  const buckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const pr of merged) {
    if (!pr.mergedAt) continue;
    const key = new Date(pr.mergedAt).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

// ---- Review decisions given ----

export interface DecisionCount {
  state: string;
  count: number;
}

function computeReviewDecisionsGiven(
  reviewedPRs: github.PullRequest[],
  viewerLogin: string | undefined,
): DecisionCount[] {
  const counts: Record<string, number> = {};
  for (const pr of reviewedPRs) {
    if (!pr.reviews) continue;
    // Find the viewer's latest review on each PR.
    const viewerReviews = pr.reviews.filter((r) => r.author === viewerLogin);
    if (viewerReviews.length === 0) continue;
    const latest = viewerReviews.reduce((a, b) => {
      const aTs = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bTs = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bTs > aTs ? b : a;
    });
    counts[latest.state] = (counts[latest.state] || 0) + 1;
  }
  return Object.entries(counts).map(([state, count]) => ({ state, count }));
}

// ---- Repo breakdown ----

export interface RepoCount {
  repo: string;
  count: number;
}

function computeRepoBreakdown(prs: github.PullRequest[]): RepoCount[] {
  const counts = new Map<string, number>();
  for (const pr of prs) {
    const key = `${pr.repoOwner}/${pr.repoName}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([repo, count]) => ({ repo, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Exported hook ----

export interface MetricsData {
  // Historical snapshots from backend DB.
  history: storage.MetricsSnapshot[];
  historyLoading: boolean;

  // Summary cards (current state).
  openPRs: number;
  pendingReviews: number;
  merged14d: number;
  avgMergeHours: number;

  // Merge velocity (current merged data).
  mergeVelocity: DayBucket[];

  // PR size distribution (current open + merged).
  sizeDistribution: Record<SizeLabel, number>;

  // Review decision breakdown (current open PRs).
  reviewDecisions: { label: string; count: number }[];

  // CI health breakdown (current open PRs).
  ciHealth: { label: string; count: number }[];

  // Review queue age (pending review requests).
  reviewQueueAge: Record<AgeBucket, number>;

  // Review decisions given by the viewer.
  decisionsGiven: DecisionCount[];

  // Repository breakdown (all categories combined).
  repoBreakdown: RepoCount[];

  // Attention needed.
  attention: AttentionItem[];
}

export function useMetrics(): MetricsData {
  const [history, setHistory] = useState<storage.MetricsSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Subscribe to store changes so we recompute when data updates.
  const pages = usePRStore((s) => s.pages);
  const viewerLogin = undefined; // Will come from auth store if available.

  // Fetch historical snapshots on mount.
  useEffect(() => {
    setHistoryLoading(true);
    GetMetricsHistory(14)
      .then((data: storage.MetricsSnapshot[]) => setHistory(data || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  // Collect all items from page caches.
  const allMyPRs = useMemo(() => getAllItems("myPRs"), [pages.myPRs]);
  const allMerged = useMemo(() => getAllItems("myRecentMerged"), [pages.myRecentMerged]);
  const allReviewReqs = useMemo(() => getAllItems("reviewRequests"), [pages.reviewRequests]);
  const allTeamReviewReqs = useMemo(() => getAllItems("teamReviewRequests"), [pages.teamReviewRequests]);
  const allReviewed = useMemo(() => getAllItems("reviewedByMe"), [pages.reviewedByMe]);

  // Summary counts.
  const openPRs = allMyPRs.length;
  const pendingReviews = allReviewReqs.length + allTeamReviewReqs.length;
  const merged14d = allMerged.length;

  const avgMergeHours = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const pr of allMerged) {
      if (!pr.mergedAt) continue;
      total += (new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) / (1000 * 60 * 60);
      count++;
    }
    return count > 0 ? total / count : 0;
  }, [allMerged]);

  // Merge velocity.
  const mergeVelocity = useMemo(() => computeMergeVelocity(allMerged), [allMerged]);

  // PR size distribution.
  const sizeDistribution = useMemo(() => {
    const dist: Record<SizeLabel, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0 };
    for (const pr of [...allMyPRs, ...allMerged]) {
      dist[prSizeLabel(pr.additions, pr.deletions)]++;
    }
    return dist;
  }, [allMyPRs, allMerged]);

  // Review decision breakdown for open PRs.
  const reviewDecisions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pr of allMyPRs) {
      const key = pr.reviewDecision || "NONE";
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([label, count]) => ({ label, count }));
  }, [allMyPRs]);

  // CI health for open PRs.
  const ciHealth = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pr of allMyPRs) {
      const key = pr.checksStatus || "NONE";
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([label, count]) => ({ label, count }));
  }, [allMyPRs]);

  // Review queue age distribution.
  const reviewQueueAge = useMemo(() => {
    const dist: Record<AgeBucket, number> = { "<1d": 0, "1-3d": 0, "3-7d": 0, "1-2w": 0, "2w+": 0 };
    for (const pr of allReviewReqs) {
      dist[ageBucket(pr.createdAt)]++;
    }
    return dist;
  }, [allReviewReqs]);

  // Decisions given by the viewer.
  const decisionsGiven = useMemo(
    () => computeReviewDecisionsGiven(allReviewed, viewerLogin),
    [allReviewed, viewerLogin],
  );

  // Repo breakdown across all categories.
  const repoBreakdown = useMemo(() => {
    const all = [...allMyPRs, ...allMerged, ...allReviewReqs, ...allTeamReviewReqs, ...allReviewed];
    // Deduplicate by nodeId.
    const seen = new Set<string>();
    const unique = all.filter((pr) => {
      if (seen.has(pr.nodeId)) return false;
      seen.add(pr.nodeId);
      return true;
    });
    return computeRepoBreakdown(unique);
  }, [allMyPRs, allMerged, allReviewReqs, allTeamReviewReqs, allReviewed]);

  // Attention needed.
  const attention = useMemo(() => computeAttention(allMyPRs), [allMyPRs]);

  return {
    history,
    historyLoading,
    openPRs,
    pendingReviews,
    merged14d,
    avgMergeHours,
    mergeVelocity,
    sizeDistribution,
    reviewDecisions,
    ciHealth,
    reviewQueueAge,
    decisionsGiven,
    repoBreakdown,
    attention,
  };
}
