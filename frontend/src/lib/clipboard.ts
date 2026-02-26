import type { github } from "../../wailsjs/go/models";

export type CopyGrouping = "none" | "repo" | "size";

/** Size label thresholds — must match PRSizeBadge / prSize in utils.ts */
function getSizeLabel(additions: number, deletions: number): string {
  const total = additions + deletions;
  if (total < 10) return "XS";
  if (total < 50) return "S";
  if (total < 200) return "M";
  if (total < 500) return "L";
  return "XL";
}

/** Full display name for size group headers */
const SIZE_DISPLAY: Record<string, string> = {
  XS: "Extra Small",
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra Large",
};

/** Ordered list so groups always appear XS → XL */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];

/** Format a single PR line: `[title](url) - (SIZE, +add, -del)` */
function formatPRLine(pr: github.PullRequest): string {
  const size = getSizeLabel(pr.additions, pr.deletions);
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

/** Flat list — no group headers */
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

/** Group under `*Extra Small*`, `*Small*`, …, `*Extra Large*` headers */
function formatGroupedBySize(prs: github.PullRequest[]): string {
  const groups = new Map<string, github.PullRequest[]>();
  for (const pr of prs) {
    const key = getSizeLabel(pr.additions, pr.deletions);
    const list = groups.get(key) ?? [];
    list.push(pr);
    groups.set(key, list);
  }

  const sections: string[] = [];
  for (const code of SIZE_ORDER) {
    const items = groups.get(code);
    if (!items || items.length === 0) continue;
    const header = SIZE_DISPLAY[code] ?? code;
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
