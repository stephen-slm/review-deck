import { cn } from "@/lib/utils";

interface PRSizeBadgeProps {
  additions: number;
  deletions: number;
}

function getSize(additions: number, deletions: number) {
  const total = additions + deletions;
  if (total < 10) return { label: "XS", bg: "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200" };
  if (total < 50) return { label: "S", bg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" };
  if (total < 200) return { label: "M", bg: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" };
  if (total < 500) return { label: "L", bg: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200" };
  return { label: "XL", bg: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200" };
}

export function PRSizeBadge({ additions, deletions }: PRSizeBadgeProps) {
  const size = getSize(additions, deletions);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold",
        size.bg
      )}
      title={`+${additions} / -${deletions}`}
    >
      {size.label}
    </span>
  );
}
