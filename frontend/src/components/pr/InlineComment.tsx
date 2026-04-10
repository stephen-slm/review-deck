import { useState, useCallback } from "react";
import {
  Loader2,
  MessageSquare,
  Send,
  XCircle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Reply,
  ExternalLink,
} from "lucide-react";
import type { github } from "../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { AddPRReviewComment } from "../../../wailsjs/go/services/PullRequestService";
import { ResolveThread, UnresolveThread, ReplyToThread } from "../../../wailsjs/go/services/PullRequestService";
import { TemplateDropdown } from "./TemplateDropdown";
import { useDraftReviewStore } from "@/stores/draftReviewStore";

/** Renders existing review thread comments inline beneath a diff line. */
export function InlineThreadDisplay({
  thread,
  onToggleResolved,
  onReplied,
}: {
  thread: github.ReviewThread;
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
  onReplied?: () => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [collapsed, setCollapsed] = useState(thread.isResolved);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  const handleToggleResolved = useCallback(async () => {
    if (!onToggleResolved) return;
    setResolving(true);
    const newState = !thread.isResolved;
    onToggleResolved(thread.id, newState);
    try {
      if (newState) {
        await ResolveThread(thread.id);
      } else {
        await UnresolveThread(thread.id);
      }
    } catch {
      onToggleResolved(thread.id, !newState);
    } finally {
      setResolving(false);
    }
  }, [thread.id, thread.isResolved, onToggleResolved]);

  const handleReply = useCallback(async () => {
    if (!replyBody.trim()) return;
    setSubmittingReply(true);
    try {
      await ReplyToThread(thread.id, replyBody.trim());
      setReplyBody("");
      setShowReply(false);
      onReplied?.();
    } catch {
      // User can retry
    } finally {
      setSubmittingReply(false);
    }
  }, [thread.id, replyBody, onReplied]);

  const commentCount = thread.comments?.length ?? 0;

  return (
    <div className={`mx-2 my-1 rounded-md border border-border`}>
      {/* Collapse toggle for resolved threads */}
      {thread.isResolved && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          <CheckCircle2 className="h-3 w-3" />
          <span>Resolved thread ({commentCount} comment{commentCount !== 1 ? "s" : ""})</span>
        </button>
      )}
      {!collapsed && thread.comments.map((comment, ci) => (
        <div
          key={comment.id || ci}
          className={`${ci > 0 || thread.isResolved ? "border-t border-border" : ""}`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50">
            {comment.authorAvatar ? (
              <img
                src={comment.authorAvatar}
                alt={comment.author}
                className="h-4 w-4 rounded-full"
              />
            ) : (
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
                {(comment.author || "?")[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-xs font-semibold text-foreground">{comment.author}</span>
            {comment.createdAt && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(comment.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground whitespace-pre-wrap px-3 py-2">{comment.body}</p>
        </div>
      ))}
      {/* Reply form */}
      {!collapsed && showReply && (
        <div className="border-t border-border px-3 py-2">
          <div className="flex gap-2">
            <textarea
              autoFocus
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowReply(false);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleReply();
              }}
              placeholder="Reply... (⌘+Enter to submit)"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={2}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={handleReply}
                disabled={!replyBody.trim() || submittingReply}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
              >
                {submittingReply ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
              </button>
              <TemplateDropdown onSelect={(body) => setReplyBody((prev) => prev ? prev + "\n" + body : body)} />
              <button
                onClick={() => { setShowReply(false); setReplyBody(""); }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                <XCircle className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Actions bar: reply + open + resolve */}
      {!collapsed && (
        <div className="flex items-center justify-between border-t border-border px-2 py-1 bg-muted/50">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowReply((s) => !s)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
            {thread.url && (
              <button
                onClick={() => BrowserOpenURL(thread.url)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Open in GitHub (o)"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </button>
            )}
          </div>
          {onToggleResolved && (
            <button
              onClick={handleToggleResolved}
              disabled={resolving}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
            >
              {resolving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : thread.isResolved ? (
                <Circle className="h-3 w-3" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {thread.isResolved ? "Unresolve" : "Resolve"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Button shown on hover to add a new comment to a diff line. */
export function AddCommentButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="absolute left-1 top-0 hidden group-hover:inline-flex items-center justify-center h-full text-blue-500 hover:text-blue-600"
      title="Add comment"
    >
      <MessageSquare className="h-3 w-3" />
    </button>
  );
}

/** Inline comment form for creating a new review thread comment. */
export function CommentForm({
  prNodeId,
  filePath,
  line,
  onClose,
  onSubmitted,
}: {
  prNodeId: string;
  filePath: string;
  line: number;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const addDraft = useDraftReviewStore((s) => s.addDraft);

  const handleSubmit = useCallback(async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await AddPRReviewComment(prNodeId, body.trim(), filePath, line);
      onSubmitted?.();
      onClose();
    } catch {
      // User can retry
    } finally {
      setSubmitting(false);
    }
  }, [prNodeId, filePath, line, body, onClose, onSubmitted]);

  const handleStage = useCallback(() => {
    if (!body.trim()) return;
    addDraft(prNodeId, filePath, line, body.trim());
    onClose();
  }, [prNodeId, filePath, line, body, addDraft, onClose]);

  return (
    <div className="p-2">
      <div className="flex gap-2">
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
            if (e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); handleStage(); }
          }}
          placeholder="Leave a comment... (⌘+Enter to post, ⇧+Enter to stage)"
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          rows={2}
        />
        <div className="flex flex-col gap-1">
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
            title="Post now (⌘+Enter)"
          >
            {submitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={handleStage}
            disabled={!body.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs font-medium text-primary disabled:opacity-50 hover:bg-primary/20"
            title="Stage for batch review (⇧+Enter)"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
          <TemplateDropdown onSelect={(tmpl) => setBody((prev) => prev ? prev + "\n" + tmpl : tmpl)} />
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
