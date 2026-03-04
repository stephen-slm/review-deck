import {
  Sparkles,
  Loader2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { mdComponents } from "@/lib/markdownComponents";

export function AIReviewPanel({
  reviewing,
  result,
  error,
  hasLocalPath,
  hasTools,
  onStart,
  onCancel,
}: {
  reviewing: boolean;
  result: { result: string; cost: number; duration: number } | null;
  error: string | null;
  hasLocalPath: boolean;
  hasTools: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  if (!hasLocalPath) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12">
        <Sparkles className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This repository does not have a local path configured.
        </p>
        <p className="text-xs text-muted-foreground">
          Add the local clone path in Settings to enable AI reviews.
        </p>
      </div>
    );
  }

  if (!hasTools) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12">
        <Sparkles className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Required CLI tools are not installed.
        </p>
        <p className="text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">gh</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">claude</code> CLI must be installed and on PATH.
        </p>
      </div>
    );
  }

  // Idle state — no review has been requested yet
  if (!reviewing && !result && !error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-12">
        <Sparkles className="h-10 w-10 text-purple-500/60" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">AI Code Review</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run an AI-powered review of this pull request's diff.
          </p>
        </div>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <Sparkles className="h-4 w-4" />
          Start Review
        </button>
      </div>
    );
  }

  // Loading state
  if (reviewing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Reviewing...</p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI is analyzing the PR diff. This may take a few minutes.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <XCircle className="h-4 w-4" />
          Cancel
        </button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          Review failed: {error}
        </div>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <Sparkles className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  // Result state
  if (result) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-foreground">AI Review</h3>
          </div>
          <div className="flex items-center gap-3">
            {result.cost > 0 && (
              <span className="text-xs text-muted-foreground">
                ${result.cost.toFixed(4)}
              </span>
            )}
            {result.duration > 0 && (
              <span className="text-xs text-muted-foreground">
                {result.duration < 60
                  ? `${Math.round(result.duration)}s`
                  : `${Math.floor(result.duration / 60)}m ${Math.round(result.duration % 60)}s`}
              </span>
            )}
            <button
              onClick={onStart}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              Re-run
            </button>
          </div>
        </div>
        <div className="prose dark:prose-invert prose-sm max-w-none font-sans text-[14px] rounded-lg border border-border bg-card p-4 prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-thead:border-border prose-tr:border-border">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
            {result.result}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return null;
}
