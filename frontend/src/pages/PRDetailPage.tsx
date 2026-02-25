import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  GitCommit,
  FileCode,
  Plus,
  Minus,
  Clock,
  User,
  Users,
  Tag,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { usePRStore } from "@/stores/prStore";
import { github } from "../../wailsjs/go/models";
import { timeAgo } from "@/lib/utils";
import { StateBadge } from "@/components/pr/StateBadge";
import { PRSizeBadge } from "@/components/pr/PRSizeBadge";
import { ReviewStatusBadge } from "@/components/pr/ReviewStatusBadge";
import { ChecksStatusIcon } from "@/components/pr/ChecksStatusIcon";
import { MergeButton } from "@/components/pr/MergeButton";
import { ReviewerAssign } from "@/components/pr/ReviewerAssign";

/** Search all PR store arrays for a PR by nodeId. */
function useFindPR(nodeId: string | undefined): github.PullRequest | undefined {
  const myPRs = usePRStore((s) => s.myPRs);
  const myRecentMerged = usePRStore((s) => s.myRecentMerged);
  const reviewRequests = usePRStore((s) => s.reviewRequests);
  const teamReviewRequests = usePRStore((s) => s.teamReviewRequests);
  const reviewedByMe = usePRStore((s) => s.reviewedByMe);

  return useMemo(() => {
    if (!nodeId) return undefined;
    const all = [
      ...myPRs,
      ...myRecentMerged,
      ...reviewRequests,
      ...teamReviewRequests,
      ...reviewedByMe,
    ];
    return all.find((pr) => pr.nodeId === nodeId);
  }, [nodeId, myPRs, myRecentMerged, reviewRequests, teamReviewRequests, reviewedByMe]);
}

export function PRDetailPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const pr = useFindPR(nodeId);

  if (!pr) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Pull request not found. It may have been cleared from the cache.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back
        </button>
      </div>
    );
  }

  const repo = `${pr.repoOwner}/${pr.repoName}`;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight text-foreground">
              {pr.title}
              <span className="ml-2 font-normal text-muted-foreground">
                #{pr.number}
              </span>
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>{repo}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={pr.state} isDraft={pr.isDraft} />
          <ReviewStatusBadge reviewDecision={pr.reviewDecision} />
          <ChecksStatusIcon status={pr.checksStatus} />
          {pr.mergeable === "CONFLICTING" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-medium text-red-300">
              <AlertTriangle className="h-3 w-3" />
              Conflicts
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Author + timestamps */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            {pr.authorAvatar ? (
              <img
                src={pr.authorAvatar}
                alt={pr.author}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-medium">
                {pr.author?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{pr.author}</p>
              <p className="text-xs text-muted-foreground">
                opened {timeAgo(pr.createdAt)} &middot; updated{" "}
                {timeAgo(pr.updatedAt)}
                {pr.mergedAt && (
                  <>
                    {" "}&middot; merged {timeAgo(pr.mergedAt)}
                    {pr.mergedBy && <> by {pr.mergedBy}</>}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Branch info */}
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {pr.headRef}
            </code>
            <span className="text-muted-foreground">&rarr;</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {pr.baseRef}
            </code>
          </div>

          {/* Body */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Description
            </h3>
            {pr.body ? (
              <div className="prose prose-invert prose-sm max-w-none rounded-lg border border-border bg-card p-4 prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {pr.body}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm italic text-muted-foreground">
                No description provided.
              </p>
            )}
          </section>

          {/* Reviews */}
          {pr.reviews && pr.reviews.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Reviews
              </h3>
              <div className="space-y-2">
                {pr.reviews.map((review, i) => (
                  <div
                    key={review.id || i}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      {review.authorAvatar ? (
                        <img
                          src={review.authorAvatar}
                          alt={review.author}
                          className="h-5 w-5 rounded-full"
                        />
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs">
                          {review.author?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {review.author}
                      </span>
                      <ReviewStateBadge state={review.state} />
                      {review.submittedAt && (
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(review.submittedAt)}
                        </span>
                      )}
                    </div>
                    {review.body && (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {review.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <SidebarSection title="Actions">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => BrowserOpenURL(pr.url)}
                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in GitHub
              </button>
              {pr.state === "OPEN" && (
                <div className="flex items-center">
                  <MergeButton
                    prNodeId={pr.nodeId}
                    mergeable={pr.mergeable}
                    state={pr.state}
                    isDraft={pr.isDraft}
                    onMerged={() => navigate(-1)}
                  />
                </div>
              )}
              {pr.state === "OPEN" && (
                <ReviewerAssign
                  prNodeId={pr.nodeId}
                  currentReviewers={(pr.reviewRequests || []).map(
                    (rr) => rr.reviewer
                  )}
                />
              )}
            </div>
          </SidebarSection>

          {/* Stats */}
          <SidebarSection title="Stats">
            <div className="grid grid-cols-2 gap-2">
              <StatItem
                icon={<Plus className="h-3.5 w-3.5 text-green-400" />}
                label="Additions"
                value={String(pr.additions)}
              />
              <StatItem
                icon={<Minus className="h-3.5 w-3.5 text-red-400" />}
                label="Deletions"
                value={String(pr.deletions)}
              />
              <StatItem
                icon={<FileCode className="h-3.5 w-3.5 text-muted-foreground" />}
                label="Files"
                value={String(pr.changedFiles)}
              />
              <StatItem
                icon={<GitCommit className="h-3.5 w-3.5 text-muted-foreground" />}
                label="Commits"
                value={String(pr.commitCount)}
              />
            </div>
            <div className="mt-2">
              <PRSizeBadge additions={pr.additions} deletions={pr.deletions} />
            </div>
          </SidebarSection>

          {/* Review requests */}
          {pr.reviewRequests && pr.reviewRequests.length > 0 && (
            <SidebarSection title="Review Requests">
              <div className="space-y-1.5">
                {pr.reviewRequests.map((rr, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {rr.reviewerType === "team" ? (
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm text-foreground">
                      {rr.reviewer}
                    </span>
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                      {rr.reviewerType}
                    </span>
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Labels */}
          {pr.labels && pr.labels.length > 0 && (
            <SidebarSection title="Labels">
              <div className="flex flex-wrap gap-1.5">
                {pr.labels.map((label) => (
                  <LabelBadge key={label.name} label={label} />
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Assignees */}
          {pr.assignees && pr.assignees.length > 0 && (
            <SidebarSection title="Assignees">
              <div className="space-y-1.5">
                {pr.assignees.map((user) => (
                  <div key={user.login} className="flex items-center gap-2">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.login}
                        className="h-5 w-5 rounded-full"
                      />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs">
                        {user.login?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm text-foreground">
                      {user.name || user.login}
                    </span>
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Timestamps */}
          <SidebarSection title="Timestamps">
            <div className="space-y-1">
              <TimestampRow
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Created"
                date={pr.createdAt}
              />
              <TimestampRow
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                label="Updated"
                date={pr.updatedAt}
              />
              {pr.mergedAt && (
                <TimestampRow
                  icon={<Tag className="h-3.5 w-3.5" />}
                  label="Merged"
                  date={pr.mergedAt}
                />
              )}
              {pr.closedAt && !pr.mergedAt && (
                <TimestampRow
                  icon={<Tag className="h-3.5 w-3.5" />}
                  label="Closed"
                  date={pr.closedAt}
                />
              )}
            </div>
          </SidebarSection>
        </div>
      </div>
    </div>
  );
}

// ---- Helper components ----

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function TimestampRow({
  icon,
  label,
  date,
}: {
  icon: React.ReactNode;
  label: string;
  date: string | Date;
}) {
  const d = new Date(date);
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <span>{label}:</span>
      <span className="ml-auto text-foreground" title={d.toLocaleString()}>
        {timeAgo(date)}
      </span>
    </div>
  );
}

function ReviewStateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    APPROVED: "bg-green-900/60 text-green-300",
    CHANGES_REQUESTED: "bg-red-900/60 text-red-300",
    COMMENTED: "bg-zinc-700 text-zinc-300",
    DISMISSED: "bg-zinc-700 text-zinc-300",
    PENDING: "bg-yellow-900/60 text-yellow-300",
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
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[state] || "bg-zinc-700 text-zinc-300"}`}
    >
      {labels[state] || state}
    </span>
  );
}

function LabelBadge({ label }: { label: github.Label }) {
  // GitHub label colors are hex without the #
  const bg = label.color ? `#${label.color}` : undefined;

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: bg ? `${bg}33` : undefined, // 20% opacity
        color: bg || undefined,
        border: bg ? `1px solid ${bg}66` : undefined,
      }}
    >
      {label.name}
    </span>
  );
}
