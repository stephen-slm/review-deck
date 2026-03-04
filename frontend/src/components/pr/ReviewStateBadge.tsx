export function ReviewStateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
    CHANGES_REQUESTED: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
    COMMENTED: "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200",
    DISMISSED: "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200",
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  };
  const labels: Record<string, string> = {
    APPROVED: "Approved",
    CHANGES_REQUESTED: "Changes requested",
    COMMENTED: "Commented",
    DISMISSED: "Dismissed",
    PENDING: "Pending",
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[state] || "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200"}`}
    >
      {labels[state] || state}
    </span>
  );
}
