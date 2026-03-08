/**
 * Centralized PR size definitions.
 *
 * Sizes are determined by (additions + deletions) against configurable
 * thresholds.  Every consumer (badge, clipboard, utilities) should import
 * from here instead of defining its own thresholds.
 */

export type PRSizeLabel = "S" | "M" | "L" | "XL" | "XXL";

/**
 * Upper-bound thresholds (exclusive) for each size bucket.
 * A PR whose `additions + deletions` is:
 *   < s   → S
 *   < m   → M
 *   < l   → L
 *   < xl  → XL
 *   >= xl → XXL
 */
export interface PRSizeThresholds {
  s: number;
  m: number;
  l: number;
  xl: number;
}

export const DEFAULT_PR_SIZE_THRESHOLDS: PRSizeThresholds = {
  s: 10,
  m: 50,
  l: 200,
  xl: 500,
};

/** Determine the size label for a PR given its line counts and thresholds. */
export function getPRSizeLabel(
  additions: number,
  deletions: number,
  thresholds: PRSizeThresholds = DEFAULT_PR_SIZE_THRESHOLDS,
): PRSizeLabel {
  const total = additions + deletions;
  if (total < thresholds.s) return "S";
  if (total < thresholds.m) return "M";
  if (total < thresholds.l) return "L";
  if (total < thresholds.xl) return "XL";
  return "XXL";
}

/** Tailwind classes for the inline badge component. */
export const PR_SIZE_BADGE_STYLES: Record<PRSizeLabel, string> = {
  S: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  M: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  L: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
  XL: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  XXL: "bg-red-200 text-red-900 dark:bg-red-800/70 dark:text-red-100",
};

/** Human-readable display names for size group headers. */
export const PR_SIZE_DISPLAY: Record<PRSizeLabel, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra Large",
  XXL: "Extra Extra Large",
};

/** Ordered list so groups always appear S -> XXL. */
export const PR_SIZE_ORDER: PRSizeLabel[] = ["S", "M", "L", "XL", "XXL"];
