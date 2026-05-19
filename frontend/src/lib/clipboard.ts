import type { github } from "../../wailsjs/go/models";
import { getPRSizeLabel, PR_SIZE_DISPLAY, PR_SIZE_ORDER } from "@/lib/prSizes";
import { useSettingsStore } from "@/stores/settingsStore";

export type CopyGrouping = "none" | "repo" | "size";

/** Common default branch names — PRs targeting these are NOT considered stacked. */
export const DEFAULT_BRANCHES: ReadonlySet<string> = new Set(["main", "master", "develop", "development"]);

export interface StackInfo {
  position: number;
  total: number;
  chainId: string;
}

/**
 * Compute stack chains from a set of PRs. A PR is part of a stack when its
 * baseRef matches another PR's headRef (within the same repo). Returns a map
 * from nodeId → stack info for every PR that participates in a multi-PR chain.
 */
export function computeStacks(allPRs: github.PullRequest[]): Map<string, StackInfo> {
  const headRefMap = new Map<string, github.PullRequest>();
  for (const pr of allPRs) {
    headRefMap.set(`${pr.repoOwner}/${pr.repoName}:${pr.headRef}`, pr);
  }

  const result = new Map<string, StackInfo>();
  const visited = new Set<string>();

  for (const pr of allPRs) {
    if (visited.has(pr.nodeId)) continue;
    if (DEFAULT_BRANCHES.has(pr.baseRef)) continue;

    const chain: github.PullRequest[] = [pr];
    visited.add(pr.nodeId);
    let cur = pr;

    while (!DEFAULT_BRANCHES.has(cur.baseRef)) {
      const parent = headRefMap.get(`${cur.repoOwner}/${cur.repoName}:${cur.baseRef}`);
      if (!parent || visited.has(parent.nodeId)) break;
      chain.unshift(parent);
      visited.add(parent.nodeId);
      cur = parent;
    }

    let tip = chain[chain.length - 1];
    for (;;) {
      const child = allPRs.find(
        (p) =>
          !visited.has(p.nodeId) &&
          p.baseRef === tip.headRef &&
          p.repoOwner === tip.repoOwner &&
          p.repoName === tip.repoName,
      );
      if (!child) break;
      chain.push(child);
      visited.add(child.nodeId);
      tip = child;
    }

    if (chain.length < 2) continue;

    const chainId = chain[0].nodeId;
    for (let i = 0; i < chain.length; i++) {
      result.set(chain[i].nodeId, { position: i + 1, total: chain.length, chainId });
    }
  }

  return result;
}

/**
 * Sort PRs so members of the same stack chain are adjacent and ordered by
 * position. Non-stacked PRs retain their relative order. Each chain is placed
 * at the position of its earliest member in the original array.
 */
function sortByStackOrder(
  prs: github.PullRequest[],
  stacks: Map<string, StackInfo>,
): github.PullRequest[] {
  const chainMinIndex = new Map<string, number>();
  for (let i = 0; i < prs.length; i++) {
    const info = stacks.get(prs[i].nodeId);
    if (!info) continue;
    const existing = chainMinIndex.get(info.chainId);
    if (existing === undefined || i < existing) {
      chainMinIndex.set(info.chainId, i);
    }
  }

  const keyed = prs.map((pr, i) => {
    const info = stacks.get(pr.nodeId);
    if (info) {
      return { pr, group: chainMinIndex.get(info.chainId)!, sub: info.position };
    }
    return { pr, group: i, sub: 0 };
  });

  keyed.sort((a, b) => a.group - b.group || a.sub - b.sub);
  return keyed.map((k) => k.pr);
}

/** Format a single PR line with optional stack annotation. */
function formatPRLine(pr: github.PullRequest, stacks?: Map<string, StackInfo>): string {
  const thresholds = useSettingsStore.getState().prSizeThresholds;
  const size = getPRSizeLabel(pr.additions, pr.deletions, thresholds);
  let line = `[${pr.title}](${pr.url}) - (${size}, +${pr.additions}, -${pr.deletions})`;
  const info = stacks?.get(pr.nodeId);
  if (info) {
    line += ` [Stack ${info.position}/${info.total}]`;
  }
  return line;
}

/**
 * Format a single PR for clipboard copy (includes repo header).
 * When contextPRs is provided, stacked PRs are annotated with their position.
 */
export function formatSinglePR(pr: github.PullRequest, contextPRs?: github.PullRequest[]): string {
  const stacks = contextPRs ? computeStacks(contextPRs) : undefined;
  const repo = `${pr.repoOwner}/${pr.repoName}`;
  return `:PR:\n\n*${repo}*\n${formatPRLine(pr, stacks)}`;
}

/**
 * Format multiple PRs for clipboard copy with the given grouping mode.
 * When contextPRs is provided, stacked PRs are annotated and sorted by chain order.
 */
export function formatPRs(
  prs: github.PullRequest[],
  grouping: CopyGrouping,
  contextPRs?: github.PullRequest[],
): string {
  if (prs.length === 0) return "";

  const stacks = contextPRs ? computeStacks(contextPRs) : undefined;
  const sorted = stacks ? sortByStackOrder(prs, stacks) : prs;

  if (sorted.length === 1) {
    const repo = `${sorted[0].repoOwner}/${sorted[0].repoName}`;
    return `:PR:\n\n*${repo}*\n${formatPRLine(sorted[0], stacks)}`;
  }

  switch (grouping) {
    case "none":
      return formatNoGrouping(sorted, stacks);
    case "repo":
      return formatGroupedByRepo(sorted, stacks);
    case "size":
      return formatGroupedBySize(sorted, stacks);
  }
}

/** Flat list -- no group headers */
function formatNoGrouping(prs: github.PullRequest[], stacks?: Map<string, StackInfo>): string {
  const lines = prs.map((pr) => formatPRLine(pr, stacks));
  return `:PR:\n\n${lines.join("\n")}`;
}

/** Group under `*owner/repo*` headers */
function formatGroupedByRepo(prs: github.PullRequest[], stacks?: Map<string, StackInfo>): string {
  const groups = new Map<string, github.PullRequest[]>();
  for (const pr of prs) {
    const key = `${pr.repoOwner}/${pr.repoName}`;
    const list = groups.get(key) ?? [];
    list.push(pr);
    groups.set(key, list);
  }

  const sections: string[] = [];
  for (const [repo, items] of groups) {
    const lines = items.map((pr) => formatPRLine(pr, stacks));
    sections.push(`*${repo}*\n${lines.join("\n")}`);
  }

  return `:PR:\n\n${sections.join("\n\n")}`;
}

/** Group under `*Small*`, `*Medium*`, ..., `*Extra Extra Large*` headers */
function formatGroupedBySize(prs: github.PullRequest[], stacks?: Map<string, StackInfo>): string {
  const thresholds = useSettingsStore.getState().prSizeThresholds;
  const groups = new Map<string, github.PullRequest[]>();
  for (const pr of prs) {
    const key = getPRSizeLabel(pr.additions, pr.deletions, thresholds);
    const list = groups.get(key) ?? [];
    list.push(pr);
    groups.set(key, list);
  }

  const sections: string[] = [];
  for (const code of PR_SIZE_ORDER) {
    const items = groups.get(code);
    if (!items || items.length === 0) continue;
    const header = PR_SIZE_DISPLAY[code] ?? code;
    const lines = items.map((pr) => formatPRLine(pr, stacks));
    sections.push(`*${header}*\n${lines.join("\n")}`);
  }

  return `:PR:\n\n${sections.join("\n\n\n")}`;
}

/** Copy text to the system clipboard. Returns true on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
