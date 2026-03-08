import type { github } from "../../wailsjs/go/models";
import { getPRSizeLabel, PR_SIZE_DISPLAY, PR_SIZE_ORDER } from "@/lib/prSizes";
import { useSettingsStore } from "@/stores/settingsStore";

export type CopyGrouping = "none" | "repo" | "size";

/** Format a single PR line: `[title](url) - (SIZE, +add, -del)` */
function formatPRLine(pr: github.PullRequest): string {
  const thresholds = useSettingsStore.getState().prSizeThresholds;
  const size = getPRSizeLabel(pr.additions, pr.deletions, thresholds);
  return `[${pr.title}](${pr.url}) - (${size}, +${pr.additions}, -${pr.deletions})`;
}

/**
 * Format a single PR for clipboard copy (includes repo header).
 *
 * ```
 * :PR:
 *
 * *owner/repo*
 * [title](url) - (SIZE, +add, -del)
 * ```
 */
export function formatSinglePR(pr: github.PullRequest): string {
  const repo = `${pr.repoOwner}/${pr.repoName}`;
  return `:PR:\n\n*${repo}*\n${formatPRLine(pr)}`;
}

/**
 * Format multiple PRs for clipboard copy with the given grouping mode.
 */
export function formatPRs(
  prs: github.PullRequest[],
  grouping: CopyGrouping,
): string {
  if (prs.length === 0) return "";
  if (prs.length === 1) return formatSinglePR(prs[0]);

  switch (grouping) {
    case "none":
      return formatNoGrouping(prs);
    case "repo":
      return formatGroupedByRepo(prs);
    case "size":
      return formatGroupedBySize(prs);
  }
}

/** Flat list -- no group headers */
function formatNoGrouping(prs: github.PullRequest[]): string {
  const lines = prs.map((pr) => formatPRLine(pr));
  return `:PR:\n\n${lines.join("\n")}`;
}

/** Group under `*owner/repo*` headers */
function formatGroupedByRepo(prs: github.PullRequest[]): string {
  const groups = new Map<string, github.PullRequest[]>();
  for (const pr of prs) {
    const key = `${pr.repoOwner}/${pr.repoName}`;
    const list = groups.get(key) ?? [];
    list.push(pr);
    groups.set(key, list);
  }

  const sections: string[] = [];
  for (const [repo, items] of groups) {
    const lines = items.map((pr) => formatPRLine(pr));
    sections.push(`*${repo}*\n${lines.join("\n")}`);
  }

  return `:PR:\n\n${sections.join("\n\n")}`;
}

/** Group under `*Small*`, `*Medium*`, ..., `*Extra Extra Large*` headers */
function formatGroupedBySize(prs: github.PullRequest[]): string {
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
    const lines = items.map((pr) => formatPRLine(pr));
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
