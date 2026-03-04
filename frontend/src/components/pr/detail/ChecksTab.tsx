import { useEffect, useRef } from "react";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  ExternalLink,
} from "lucide-react";
import { BrowserOpenURL } from "../../../../wailsjs/runtime/runtime";
import { useVimStore } from "@/stores/vimStore";
import { github } from "../../../../wailsjs/go/models";

/** Icon for a check run based on its status + conclusion. */
function CheckRunIcon({ status, conclusion, isMerged }: { status: string; conclusion: string; isMerged: boolean }) {
  // In-progress
  if (status === "IN_PROGRESS" || status === "QUEUED" || status === "PENDING" || status === "WAITING") {
    if (isMerged) return <Circle className="h-4 w-4 text-muted-foreground" />;
    return <Loader2 className="h-4 w-4 animate-spin text-amber-500 dark:text-amber-300" />;
  }
  // Completed — check conclusion
  if (conclusion === "SUCCESS" || conclusion === "NEUTRAL" || conclusion === "SKIPPED") {
    return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-300" />;
  }
  if (conclusion === "FAILURE" || conclusion === "TIMED_OUT" || conclusion === "CANCELLED" || conclusion === "STARTUP_FAILURE") {
    return <XCircle className="h-4 w-4 text-red-600 dark:text-red-300" />;
  }
  if (conclusion === "ACTION_REQUIRED") {
    return <Circle className="h-4 w-4 text-amber-500 dark:text-amber-300" />;
  }
  // Fallback
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export function ChecksTab({
  checkRuns,
  loading,
  error,
  isMerged,
}: {
  checkRuns: github.CheckRun[] | null;
  loading: boolean;
  error: string | null;
  isMerged: boolean;
}) {
  const selectedIndex = useVimStore((s) => s.selectedIndex);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll the selected check into view.
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading checks...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
        Failed to load checks: {error}
      </div>
    );
  }
  if (!checkRuns || checkRuns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm italic text-muted-foreground">
        No check runs found for this pull request.
      </p>
    );
  }

  // Group by conclusion for a summary and sort: failures first, then pending, then passed.
  const passed = checkRuns.filter((c) => c.conclusion === "SUCCESS" || c.conclusion === "NEUTRAL" || c.conclusion === "SKIPPED");
  const failed = checkRuns.filter((c) => c.conclusion === "FAILURE" || c.conclusion === "TIMED_OUT" || c.conclusion === "CANCELLED" || c.conclusion === "STARTUP_FAILURE");
  const pending = checkRuns.filter((c) => !c.conclusion || c.status === "IN_PROGRESS" || c.status === "QUEUED" || c.status === "PENDING" || c.status === "WAITING");
  const sorted = [...failed, ...pending, ...passed];

  return (
    <section className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        {failed.length > 0 && (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-300">
            <XCircle className="h-4 w-4" /> {failed.length} failed
          </span>
        )}
        {pending.length > 0 && (
          <span className="flex items-center gap-1 text-amber-500 dark:text-amber-300">
            <Loader2 className="h-4 w-4" /> {pending.length} pending
          </span>
        )}
        {passed.length > 0 && (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-300">
            <CheckCircle className="h-4 w-4" /> {passed.length} passed
          </span>
        )}
      </div>

      {/* Individual checks — failures first, then pending, then passed */}
      <div className="space-y-1">
        {sorted.map((check, i) => (
          <div
            key={check.name + i}
            ref={(el) => { itemRefs.current[i] = el; }}
            onClick={() => { if (check.detailsUrl) BrowserOpenURL(check.detailsUrl); }}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
              check.detailsUrl ? "cursor-pointer hover:bg-muted/30" : ""
            } ${
              i === selectedIndex
                ? "ring-1 ring-primary bg-accent/40 border-primary/50"
                : "border-border bg-card"
            }`}
          >
            <CheckRunIcon status={check.status} conclusion={check.conclusion} isMerged={isMerged} />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{check.name}</span>
            <span className="text-xs text-muted-foreground capitalize">
              {check.conclusion ? check.conclusion.toLowerCase().replace("_", " ") : check.status.toLowerCase().replace("_", " ")}
            </span>
            {check.detailsUrl && (
              <ExternalLink className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
