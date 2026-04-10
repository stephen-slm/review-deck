import { useState } from "react";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Send,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useDraftReviewStore, type DraftComment } from "@/stores/draftReviewStore";
import { SubmitBatchReview } from "../../../../wailsjs/go/services/PullRequestService";

const EMPTY_DRAFTS: DraftComment[] = [];

interface PendingReviewBarProps {
  prNodeId: string;
  onSubmitted?: () => void;
}

export function PendingReviewBar({ prNodeId, onSubmitted }: PendingReviewBarProps) {
  const drafts = useDraftReviewStore((s) => s.drafts[prNodeId] ?? EMPTY_DRAFTS);
  const clearDrafts = useDraftReviewStore((s) => s.clearDrafts);
  const removeDraft = useDraftReviewStore((s) => s.removeDraft);

  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (drafts.length === 0) return null;

  const handleSubmit = async (event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES") => {
    setSubmitting(true);
    setError(null);
    try {
      const threads = drafts.map((d: DraftComment) => ({
        path: d.path,
        line: d.line,
        body: d.body,
      }));
      await SubmitBatchReview(prNodeId, body, event, threads);
      clearDrafts(prNodeId);
      setBody("");
      setExpanded(false);
      onSubmitted?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/10 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <MessageSquare className="h-4 w-4 text-primary" />
        <span>{drafts.length} pending comment{drafts.length !== 1 ? "s" : ""}</span>
        <span className="ml-auto text-xs text-muted-foreground">Click to review & submit</span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {/* Draft comments list */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-start gap-2 rounded border border-border bg-card px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-muted-foreground truncate">{d.path}:{d.line}</p>
                  <p className="mt-0.5 text-foreground whitespace-pre-wrap">{d.body}</p>
                </div>
                <button
                  onClick={() => removeDraft(prNodeId, d.id)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Review body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Leave a review summary (optional)..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={2}
          />

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {/* Submit buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSubmit("COMMENT")}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Comment
            </button>
            <button
              onClick={() => handleSubmit("APPROVE")}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              Approve
            </button>
            <button
              onClick={() => handleSubmit("REQUEST_CHANGES")}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
              Request Changes
            </button>
            <button
              onClick={() => { clearDrafts(prNodeId); setExpanded(false); }}
              disabled={submitting}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Discard all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
