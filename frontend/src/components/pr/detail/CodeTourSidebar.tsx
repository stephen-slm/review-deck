import { Map, RefreshCw } from "lucide-react";
import type { CodeTourData } from "@/types/codeTour";

export function CodeTourSidebar({
  tour,
  cost,
  duration,
  onRegenerate,
}: {
  tour: CodeTourData;
  cost: number;
  duration: number;
  onRegenerate: () => void;
}) {
  const scrollToStep = (idx: number) => {
    const el = document.getElementById(`tour-step-${idx}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Map className="h-3.5 w-3.5 text-purple-500" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Code Tour
        </h4>
      </div>
      <p className="mb-3 text-sm font-medium text-foreground">{tour.title}</p>

      {/* Metadata */}
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        {cost > 0 && <span>${cost.toFixed(4)}</span>}
        {duration > 0 && (
          <span>
            {duration < 60
              ? `${Math.round(duration)}s`
              : `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`}
          </span>
        )}
      </div>

      {/* Step list */}
      <div className="space-y-1">
        {tour.steps.map((step, idx) => (
          <button
            key={idx}
            onClick={() => scrollToStep(idx)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
          >
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground leading-tight">{step.title}</p>
              {step.file && (
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {step.file}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Re-generate button */}
      <button
        onClick={onRegenerate}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" />
        Re-generate
      </button>
    </div>
  );
}
