import { cn } from "@/lib/utils";
import { getPRSizeLabel, PR_SIZE_BADGE_STYLES } from "@/lib/prSizes";
import { useSettingsStore } from "@/stores/settingsStore";

interface PRSizeBadgeProps {
  additions: number;
  deletions: number;
}

export function PRSizeBadge({ additions, deletions }: PRSizeBadgeProps) {
  const thresholds = useSettingsStore((s) => s.prSizeThresholds);
  const label = getPRSizeLabel(additions, deletions, thresholds);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold",
        PR_SIZE_BADGE_STYLES[label]
      )}
      title={`+${additions} / -${deletions}`}
    >
      {label}
    </span>
  );
}
