/**
 * Centralized PR size definitions.
 *
 * Sizes are determined by (additions + deletions) against configurable
 * thresholds.  Every consumer (badge, clipboard, utilities) should import
 * from here instead of defining its own thresholds.
 */

export type PRSizeLabel = "XS" | "S" | "M" | "L" | "XL" | "XXL";

/**
 * Upper-bound thresholds (exclusive) for each size bucket.
 * A PR whose `additions + deletions` is:
 *   < xs  → XS
 *   < s   → S
 *   < m   → M
 *   < l   → L
 *   < xl  → XL
 *   >= xl → XXL
 */
export interface PRSizeThresholds {
  xs: number;
  s: number;
  m: number;
  l: number;
  xl: number;
}

export const DEFAULT_PR_SIZE_THRESHOLDS: PRSizeThresholds = {
  xs: 10,
  s: 50,
  m: 200,
  l: 500,
  xl: 1000,
};

/** Determine the size label for a PR given its line counts and thresholds. */
export function getPRSizeLabel(
  additions: number,
  deletions: number,
  thresholds: PRSizeThresholds = DEFAULT_PR_SIZE_THRESHOLDS,
): PRSizeLabel {
  const total = additions + deletions;
  if (total < thresholds.xs) return "XS";
  if (total < thresholds.s) return "S";
  if (total < thresholds.m) return "M";
  if (total < thresholds.l) return "L";
  if (total < thresholds.xl) return "XL";
  return "XXL";
}

/** Tailwind classes for the inline badge component. */
export const PR_SIZE_BADGE_STYLES: Record<PRSizeLabel, string> = {
  XS: "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200",
  S: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  M: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  L: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
  XL: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  XXL: "bg-red-200 text-red-900 dark:bg-red-800/70 dark:text-red-100",
};

/** Human-readable display names for size group headers. */
export const PR_SIZE_DISPLAY: Record<PRSizeLabel, string> = {
  XS: "Extra Small",
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra Large",
  XXL: "Extra Extra Large",
};

/** Ordered list so groups always appear XS -> XXL. */
export const PR_SIZE_ORDER: PRSizeLabel[] = ["XS", "S", "M", "L", "XL", "XXL"];
