import { useMemo } from "react";
import {
  GitCommit,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  FileCode,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { mdComponents } from "@/lib/markdownComponents";
import { timeAgo } from "@/lib/utils";
import type { github } from "../../../../wailsjs/go/models";

type TimelineEvent = {
  id: string;
  type: "commit" | "comment" | "review" | "thread";
  timestamp: Date;
  author: string;
  authorAvatar?: string;
  title: string;
  body?: string;
  meta?: string;
};

function buildTimeline(
  commits: github.PRCommit[] | null,
  comments: github.PRComments | null,
  reviews: github.Review[] | null,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Commits
  if (commits) {
    for (const c of commits) {
      events.push({
        id: `commit-${c.oid}`,
        type: "commit",
        timestamp: new Date(c.committedDate),
        author: c.authorLogin || c.authorName,
        authorAvatar: c.authorAvatar,
        title: c.messageHeadline,
        meta: `+${c.additions} -${c.deletions}`,
      });
    }
  }

  // Issue comments
  if (comments?.issueComments) {
    for (const c of comments.issueComments) {
      events.push({
        id: `comment-${c.id}`,
        type: "comment",
        timestamp: new Date(c.createdAt),
        author: c.author,
        authorAvatar: c.authorAvatar,
        title: "commented",
        body: c.body,
      });
    }
  }

  // Review threads (first comment only)
  if (comments?.reviewThreads) {
    for (const t of comments.reviewThreads) {
      if (t.comments && t.comments.length > 0) {
        const first = t.comments[0];
        events.push({
          id: `thread-${t.id}`,
          type: "thread",
          timestamp: new Date(first.createdAt),
          author: first.author,
          authorAvatar: first.authorAvatar,
          title: `commented on ${t.path}`,
          body: first.body,
          meta: t.isResolved ? "resolved" : undefined,
        });
      }
    }
  }

  // Reviews
  if (reviews) {
    for (const r of reviews) {
      if (r.state === "PENDING") continue;
      const verb =
        r.state === "APPROVED"
          ? "approved"
          : r.state === "CHANGES_REQUESTED"
            ? "requested changes"
            : r.state === "DISMISSED"
              ? "dismissed review"
              : "reviewed";
      events.push({
        id: `review-${r.id}`,
        type: "review",
        timestamp: new Date(r.submittedAt),
        author: r.author,
        authorAvatar: r.authorAvatar,
        title: verb,
        body: r.body || undefined,
        meta: r.state,
      });
    }
  }

  // Sort newest first
  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return events;
}

function EventIcon({ type, meta }: { type: TimelineEvent["type"]; meta?: string }) {
  switch (type) {
    case "commit":
      return <GitCommit className="h-4 w-4 text-blue-500" />;
    case "comment":
      return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    case "thread":
      return <FileCode className="h-4 w-4 text-muted-foreground" />;
    case "review":
      if (meta === "APPROVED") return <CheckCircle className="h-4 w-4 text-green-500" />;
      if (meta === "CHANGES_REQUESTED") return <XCircle className="h-4 w-4 text-red-500" />;
      if (meta === "DISMISSED") return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      return <Eye className="h-4 w-4 text-muted-foreground" />;
  }
}

export function ActivityTimeline({
  commits,
  comments,
  reviews,
  loading,
}: {
  commits: github.PRCommit[] | null;
  comments: github.PRComments | null;
  reviews: github.Review[] | null;
  loading: boolean;
}) {
  const events = useMemo(
    () => buildTimeline(commits, comments, reviews),
    [commits, comments, reviews],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading activity...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

      {events.map((event) => (
        <div key={event.id} className="relative flex gap-3 py-2">
          {/* Icon dot */}
          <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card">
            <EventIcon type={event.type} meta={event.meta} />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 pt-1.5">
            <div className="flex items-center gap-2">
              {event.authorAvatar ? (
                <img
                  src={event.authorAvatar}
                  alt={event.author}
                  className="h-4 w-4 rounded-full"
                />
              ) : (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
                  {(event.author || "?")[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs font-semibold text-foreground">{event.author}</span>
              <span className="text-xs text-foreground">{event.title}</span>
              {event.meta && event.type === "commit" && (
                <span className="text-xs font-mono text-muted-foreground">{event.meta}</span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                {timeAgo(event.timestamp)}
              </span>
            </div>

            {event.body && (
              <div className="mt-1 rounded-md border border-border bg-card px-3 py-2">
                <div className="prose dark:prose-invert prose-sm max-w-none text-xs prose-p:text-foreground prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                    {event.body.length > 300 ? event.body.slice(0, 300) + "..." : event.body}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
