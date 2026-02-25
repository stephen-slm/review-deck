import { cn } from "@/lib/utils";

interface PRSizeBadgeProps {
  additions: number;
  deletions: number;
}

function getSize(additions: number, deletions: number) {
  const total = additions + deletions;
  if (total < 10) return { label: "XS", bg: "bg-zinc-700 text-zinc-300" };
  if (total < 50) return { label: "S", bg: "bg-green-900/60 text-green-300" };
  if (total < 200) return { label: "M", bg: "bg-yellow-900/60 text-yellow-300" };
  if (total < 500) return { label: "L", bg: "bg-orange-900/60 text-orange-300" };
  return { label: "XL", bg: "bg-red-900/60 text-red-300" };
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
