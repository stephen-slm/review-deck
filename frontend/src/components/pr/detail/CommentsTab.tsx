import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ExternalLink,
  FileCode,
  Loader2,
  ChevronDown,
  ChevronRight,
  Reply,
  Send,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { BrowserOpenURL } from "../../../../wailsjs/runtime/runtime";
import { ReplyToThread } from "../../../../wailsjs/go/services/PullRequestService";
import { useVimStore } from "@/stores/vimStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { github } from "../../../../wailsjs/go/models";
import { timeAgo } from "@/lib/utils";
import { mdComponents } from "@/lib/markdownComponents";

/** Renders a diff hunk as a syntax-highlighted code snippet for review threads. */
export function DiffHunkSnippet({ diffHunk }: { diffHunk: string }) {
  const lines = diffHunk.split("\n");
  return (
    <div className="overflow-x-auto border-b border-border bg-muted/30 font-mono text-xs leading-relaxed">
      {lines.map((line, i) => {
        let bgClass = "";
        let textClass = "text-muted-foreground";
        if (line.startsWith("+")) {
          bgClass = "bg-green-500/10";
          textClass = "text-green-700 dark:text-green-300";
        } else if (line.startsWith("-")) {
          bgClass = "bg-red-500/10";
          textClass = "text-red-700 dark:text-red-300";
        } else if (line.startsWith("@@")) {
          bgClass = "bg-blue-500/10";
          textClass = "text-blue-600 dark:text-blue-400";
        }
        return (
          <div key={i} className={`whitespace-pre px-4 py-0.5 ${bgClass} ${textClass}`}>
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}

/** Reusable comment card for both issue comments and review thread comments. */
export function CommentCard({
  author,
  authorAvatar,
  body,
  createdAt,
  compact,
}: {
  author: string;
  authorAvatar: string;
  body: string;
  createdAt: any;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "px-4 py-3" : "rounded-lg border border-border bg-card px-4 py-3"}>
      <div className="flex items-center gap-2">
        {authorAvatar ? (
          <img
            src={authorAvatar}
            alt={author}
            className="h-5 w-5 rounded-full"
          />
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs">
            {author?.[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-foreground">{author}</span>
        {createdAt && (
          <span className="text-xs text-muted-foreground">
            {timeAgo(createdAt)}
          </span>
        )}
      </div>
      {body && (
        <div className="prose dark:prose-invert prose-sm mt-1.5 max-w-none font-sans text-[14px] prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-thead:border-border prose-tr:border-border">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
            {body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/** Inline reply form for a review thread. */
function ThreadReplyForm({ threadId, onReplied }: { threadId: string; onReplied?: () => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await ReplyToThread(threadId, body.trim());
      setBody("");
      setOpen(false);
      onReplied?.();
    } catch {
      // User can retry
    } finally {
      setSubmitting(false);
    }
  }, [threadId, body, onReplied]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Reply className="h-3.5 w-3.5" />
        Reply
      </button>
    );
  }

  return (
    <div className="px-4 py-2">
      <div className="flex gap-2">
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); setBody(""); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
          placeholder="Reply... (⌘+Enter to submit)"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          rows={3}
        />
        <div className="flex flex-col gap-1">
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => { setOpen(false); setBody(""); }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CommentsTab({
  comments,
  loading,
  error,
  toggleSelectedRef,
  resolveRef,
  unresolveRef,
  onToggleResolved,
  onCommentAdded,
}: {
  comments: github.PRComments | null;
  loading: boolean;
  error: string | null;
  toggleSelectedRef?: React.MutableRefObject<(() => void) | null>;
  resolveRef?: React.MutableRefObject<(() => void) | null>;
  unresolveRef?: React.MutableRefObject<(() => void) | null>;
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
  onCommentAdded?: () => void;
}) {
  const selectedIndex = useVimStore((s) => s.selectedIndex);
  const filteredCommentUsers = useSettingsStore((s) => s.filteredCommentUsers);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Collapsed state: set of item IDs that are collapsed.
  // Issue comments use their `id`, review threads use their `id`.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const rawIssueComments = comments?.issueComments || [];
  const rawReviewThreads = comments?.reviewThreads || [];

  // Build a lowercased Set for fast lookup.
  const blockedCommenters = useMemo(
    () => new Set(filteredCommentUsers.map((u) => u.toLowerCase())),
    [filteredCommentUsers],
  );

  const issueComments = blockedCommenters.size > 0
    ? rawIssueComments.filter((c) => !blockedCommenters.has((c.author || "").toLowerCase()))
    : rawIssueComments;
  const reviewThreads = blockedCommenters.size > 0
    ? rawReviewThreads.filter((t) => !(t.comments?.length > 0 && blockedCommenters.has((t.comments[0].author || "").toLowerCase())))
    : rawReviewThreads;

  // Auto-collapse resolved threads on first load.
  useEffect(() => {
    if (initializedRef.current || reviewThreads.length === 0) return;
    initializedRef.current = true;
    const resolvedIds = new Set(
      reviewThreads.filter((t) => t.isResolved).map((t) => t.id),
    );
    if (resolvedIds.size > 0) setCollapsedIds(resolvedIds);
  }, [reviewThreads]);

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Expose toggle for the currently selected item via ref (Space key).
  useEffect(() => {
    if (toggleSelectedRef) {
      toggleSelectedRef.current = () => {
        if (selectedIndex < 0) return;
        if (selectedIndex < issueComments.length) {
          const comment = issueComments[selectedIndex];
          if (comment) toggleCollapsed(comment.id);
        } else {
          const threadIdx = selectedIndex - issueComments.length;
          const thread = reviewThreads[threadIdx];
          if (thread) toggleCollapsed(thread.id);
        }
      };
      return () => { toggleSelectedRef.current = null; };
    }
  }); // no deps — keeps closure fresh

  // Expose resolve/unresolve for the currently selected review thread via refs (r / u keys).
  useEffect(() => {
    const getSelectedThread = () => {
      if (selectedIndex < issueComments.length) return undefined;
      const threadIdx = selectedIndex - issueComments.length;
      return reviewThreads[threadIdx];
    };
    if (resolveRef) {
      resolveRef.current = () => {
        const thread = getSelectedThread();
        if (thread && !thread.isResolved) onToggleResolved?.(thread.id, true);
      };
    }
    if (unresolveRef) {
      unresolveRef.current = () => {
        const thread = getSelectedThread();
        if (thread && thread.isResolved) onToggleResolved?.(thread.id, false);
      };
    }
    return () => {
      if (resolveRef) resolveRef.current = null;
      if (unresolveRef) unresolveRef.current = null;
    };
  }); // no deps — keeps closure fresh

  // Auto-scroll the selected comment/thread into view.
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading comments...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
        Failed to load comments: {error}
      </div>
    );
  }

  const hasContent = issueComments.length > 0 || reviewThreads.length > 0;

  if (!hasContent) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm italic text-muted-foreground">
        No comments found for this pull request.
      </p>
    );
  }

  return (
    <section className="space-y-6">
      {/* Issue comments (top-level conversation) */}
      {issueComments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Conversation ({issueComments.length})
          </h3>
          <div className="space-y-2">
            {issueComments.map((comment, i) => {
              const isCollapsed = collapsedIds.has(comment.id);
              return (
                <div
                  key={comment.id}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  className={`rounded-lg transition-colors ${
                    i === selectedIndex ? "ring-1 ring-primary ring-offset-1 ring-offset-background" : ""
                  }`}
                >
                  {/* Clickable header row */}
                  <div
                    onClick={() => toggleCollapsed(comment.id)}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/30"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {comment.authorAvatar && (
                      <img src={comment.authorAvatar} className="h-4 w-4 rounded-full" alt="" />
                    )}
                    <span className="text-xs font-medium text-foreground">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                    {isCollapsed && (
                      <span className="ml-auto truncate text-xs text-muted-foreground/70">{comment.body.slice(0, 80)}{comment.body.length > 80 ? "..." : ""}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (comment.url) BrowserOpenURL(comment.url); }}
                      className="ml-auto shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      title="Open in GitHub"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                  {/* Body */}
                  {!isCollapsed && (
                    <CommentCard
                      author={comment.author}
                      authorAvatar={comment.authorAvatar}
                      body={comment.body}
                      createdAt={comment.createdAt}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review threads (inline code comments) */}
      {reviewThreads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Review threads ({reviewThreads.length})
            </h3>
            <div className="flex items-center gap-2">
              {reviewThreads.some((t) => !t.isResolved) && (
                <button
                  onClick={() => reviewThreads.filter((t) => !t.isResolved).forEach((t) => onToggleResolved?.(t.id, true))}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Resolve all
                </button>
              )}
              {reviewThreads.some((t) => t.isResolved) && (
                <button
                  onClick={() => reviewThreads.filter((t) => t.isResolved).forEach((t) => onToggleResolved?.(t.id, false))}
                  className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Unresolve all
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {reviewThreads.map((thread, i) => {
              const globalIdx = issueComments.length + i;
              const isCollapsed = collapsedIds.has(thread.id);
              return (
              <div
                key={thread.id}
                ref={(el) => { itemRefs.current[globalIdx] = el; }}
                className={`rounded-lg border transition-colors ${
                  globalIdx === selectedIndex
                    ? "ring-1 ring-primary border-primary/50 bg-card"
                    : "border-border bg-card"
                }`}
              >
                {/* Thread header — click toggles collapse */}
                <div
                  onClick={() => toggleCollapsed(thread.id)}
                  className={`flex cursor-pointer items-center gap-2 px-4 py-2 hover:bg-muted/30 ${
                    isCollapsed ? "" : "border-b border-border"
                  }`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                  <code className="truncate text-xs text-muted-foreground">
                    {thread.path}
                    {thread.line > 0 && `:${thread.line}`}
                  </code>
                  {thread.isResolved ? (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/60 dark:text-green-200">
                        Resolved
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleResolved?.(thread.id, false); }}
                        className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        title="Unresolve thread"
                      >
                        Unresolve
                      </button>
                    </div>
                  ) : (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                        Unresolved
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleResolved?.(thread.id, true); }}
                        className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        title="Resolve thread"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); if (thread.url) BrowserOpenURL(thread.url); }}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    title="Open in GitHub"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                {/* Thread code snippet + comments — hidden when collapsed */}
                {!isCollapsed && (
                  <div>
                    {/* Show the diff hunk from the first comment as code context */}
                    {thread.comments?.[0]?.diffHunk && (
                      <DiffHunkSnippet diffHunk={thread.comments[0].diffHunk} />
                    )}
                    {/* Root comment */}
                    {thread.comments?.[0] && (
                      <CommentCard
                        author={thread.comments[0].author}
                        authorAvatar={thread.comments[0].authorAvatar}
                        body={thread.comments[0].body}
                        createdAt={thread.comments[0].createdAt}
                        compact
                      />
                    )}
                    {/* Threaded replies — indented with left border */}
                    {thread.comments && thread.comments.length > 1 && (
                      <div className="ml-6 border-l-2 border-border/50">
                        {thread.comments.slice(1).map((comment) => (
                          <div key={comment.id} className="border-t border-border/30">
                            <CommentCard
                              author={comment.author}
                              authorAvatar={comment.authorAvatar}
                              body={comment.body}
                              createdAt={comment.createdAt}
                              compact
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Reply form */}
                    <div className="border-t border-border">
                      <ThreadReplyForm threadId={thread.id} onReplied={onCommentAdded} />
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
