import { useMemo, useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitMerge,
  FileCode,
  Plus,
  Minus,
  Clock,
  User,
  Users,
  Tag,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  MessageSquare,
  FileText,
  Activity,
  ThumbsUp,
  ChevronDown,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { GetPRCheckRuns, GetPRComments, GetSinglePR, ResolveThread, UnresolveThread } from "../../wailsjs/go/services/PullRequestService";

/** Rewrite GitHub image URLs to go through the authenticated backend proxy. */
function proxyImageSrc(src: string | undefined): string | undefined {
  if (!src) return src;
  try {
    const u = new URL(src);
    const host = u.hostname.toLowerCase();
    if (
      host.endsWith("githubusercontent.com") ||
      host.endsWith("github.com")
    ) {
      return `/api/proxy/image?url=${encodeURIComponent(src)}`;
    }
  } catch {
    // Not a valid URL — return as-is.
  }
  return src;
}

/** Custom markdown components — opens links in the system browser via Wails. */
const mdComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) BrowserOpenURL(href);
      }}
      className="cursor-pointer text-primary underline hover:text-primary/80"
    >
      {children}
    </a>
  ),
  img: ({ src, alt, ...props }) => (
    <img
      {...props}
      src={proxyImageSrc(src)}
      alt={alt || ""}
      className="my-2 max-w-full rounded-md border border-border"
      loading="lazy"
    />
  ),
  details: ({ children, ...props }) => (
    <details
      {...props}
      className="group rounded-md border border-border my-2"
    >
      {children}
    </details>
  ),
  summary: ({ children, ...props }) => (
    <summary
      {...props}
      className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-md list-none [&::-webkit-details-marker]:hidden"
    >
      {children}
    </summary>
  ),
};

import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useVimStore } from "@/stores/vimStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { github } from "../../wailsjs/go/models";
import { timeAgo } from "@/lib/utils";

type DetailTab = "description" | "checks" | "comments";
import { StateBadge } from "@/components/pr/StateBadge";
import { PRSizeBadge } from "@/components/pr/PRSizeBadge";
import { ReviewStatusBadge } from "@/components/pr/ReviewStatusBadge";
import { ChecksStatusIcon } from "@/components/pr/ChecksStatusIcon";
import { ReviewerAssign } from "@/components/pr/ReviewerAssign";

/** Search all PR store arrays for a PR by nodeId. */
function useFindPR(nodeId: string | undefined): github.PullRequest | undefined {
  const pages = usePRStore((s) => s.pages);

  return useMemo(() => {
    if (!nodeId) return undefined;
    const all = [
      ...pages.myPRs.items,
      ...pages.myRecentMerged.items,
      ...pages.reviewRequests.items,
      ...pages.teamReviewRequests.items,
      ...pages.reviewedByMe.items,
    ];
    return all.find((pr) => pr.nodeId === nodeId);
  }, [nodeId, pages]);
}

export function PRDetailPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const storePR = useFindPR(nodeId);

  // Independently fetched PR (from refresh or when not in store).
  const [fetchedPR, setFetchedPR] = useState<github.PullRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // The PR to display: prefer the store version, fall back to independently fetched.
  const pr = storePR ?? fetchedPR ?? undefined;

  const [activeTab, setActiveTab] = useState<DetailTab>("description");

  // Lazy-loaded check runs
  const [checkRuns, setCheckRuns] = useState<github.CheckRun[] | null>(null);
  const [checksLoading, setChecksLoading] = useState(false);
  const [checksError, setChecksError] = useState<string | null>(null);

  // Lazy-loaded comments
  const [comments, setComments] = useState<github.PRComments | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  // Refs for triggering keybinding actions on child components.
  const reviewerToggleRef = useRef<(() => void) | null>(null);
  const mergeToggleRef = useRef<(() => void) | null>(null);
  const approveRef = useRef<(() => void) | null>(null);

  // Fetch check runs when the checks tab is first selected
  useEffect(() => {
    if (activeTab !== "checks" || checkRuns !== null || checksLoading || !nodeId) return;
    setChecksLoading(true);
    GetPRCheckRuns(nodeId)
      .then(setCheckRuns)
      .catch((err) => setChecksError(String(err)))
      .finally(() => setChecksLoading(false));
  }, [activeTab, checkRuns, checksLoading, nodeId]);

  // Fetch comments when the comments tab is first selected
  useEffect(() => {
    if (activeTab !== "comments" || comments !== null || commentsLoading || !nodeId) return;
    setCommentsLoading(true);
    GetPRComments(nodeId)
      .then(setComments)
      .catch((err) => setCommentsError(String(err)))
      .finally(() => setCommentsLoading(false));
  }, [activeTab, comments, commentsLoading, nodeId]);

  /** Refresh the PR by re-fetching from GitHub. */
  const handleRefresh = async () => {
    if (!pr || refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await GetSinglePR(pr.repoOwner, pr.repoName, pr.number);
      setFetchedPR(fresh);
      // Also reset lazy-loaded tab data so they re-fetch on next view.
      setCheckRuns(null);
      setChecksError(null);
      setComments(null);
      setCommentsError(null);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  // Reset selection when the active tab changes.
  useEffect(() => {
    useVimStore.getState().setSelectedIndex(-1);
  }, [activeTab]);

  // Update list length based on active tab and loaded data.
  useEffect(() => {
    if (activeTab === "checks") {
      useVimStore.getState().setListLength(checkRuns?.length ?? 0);
    } else if (activeTab === "comments") {
      const ic = comments?.issueComments?.length ?? 0;
      const rt = comments?.reviewThreads?.length ?? 0;
      useVimStore.getState().setListLength(ic + rt);
    } else {
      useVimStore.getState().setListLength(0);
    }
  }, [activeTab, checkRuns, comments]);

  // Register VIM actions for the detail page.
  // h/l cycle tabs, j/k scroll (description) or navigate items (checks/comments).
  useEffect(() => {
    const tabKeys: DetailTab[] = ["description", "checks", "comments"];
    const currentIdx = tabKeys.indexOf(activeTab);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actions: any = {
      onGoBack: () => navigate(-1),
      onRefresh: handleRefresh,
      onTabNext: () => setActiveTab(tabKeys[(currentIdx + 1) % tabKeys.length]),
      onTabPrev: () => setActiveTab(tabKeys[(currentIdx - 1 + tabKeys.length) % tabKeys.length]),
      onAssignReviewer: () => reviewerToggleRef.current?.(),
      onMerge: () => mergeToggleRef.current?.(),
      onApprove: () => approveRef.current?.(),
    };

    if (activeTab === "description") {
      const scrollEl = document.getElementById("scroll-region");
      actions.onMoveDown = () => scrollEl?.scrollBy(0, 150);
      actions.onMoveUp = () => scrollEl?.scrollBy(0, -150);
      actions.onOpenExternal = () => { if (pr) BrowserOpenURL(pr.url); };
    } else if (activeTab === "checks") {
      actions.onOpen = (idx: number) => {
        if (checkRuns && checkRuns[idx]?.detailsUrl) BrowserOpenURL(checkRuns[idx].detailsUrl);
      };
      actions.onOpenExternal = (idx: number) => {
        if (idx >= 0 && checkRuns && checkRuns[idx]?.detailsUrl) {
          BrowserOpenURL(checkRuns[idx].detailsUrl);
        } else if (pr) {
          BrowserOpenURL(pr.url);
        }
      };
    } else if (activeTab === "comments") {
      actions.onOpenExternal = () => { if (pr) BrowserOpenURL(pr.url); };
      actions.onOpen = (idx: number) => {
        const issueComments = comments?.issueComments || [];
        const reviewThreads = comments?.reviewThreads || [];
        if (idx < issueComments.length) {
          const url = issueComments[idx]?.url;
          if (url) BrowserOpenURL(url);
        } else {
          const threadIdx = idx - issueComments.length;
          const url = reviewThreads[threadIdx]?.url;
          if (url) BrowserOpenURL(url);
        }
      };
    }

    useVimStore.getState().registerActions(actions);
    return () => useVimStore.getState().clearActions();
  }); // no deps — re-registers each render with fresh closures

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

  const tabs: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: "description", label: "Description", icon: <FileText className="h-4 w-4" /> },
    { key: "checks", label: "Checks", icon: <Activity className="h-4 w-4" /> },
    { key: "comments", label: "Comments", icon: <MessageSquare className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back + Refresh */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title="Refresh PR data from GitHub"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
        {refreshError && (
          <span className="text-xs text-destructive">{refreshError}</span>
        )}
      </div>

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
          <ChecksStatusIcon status={pr.checksStatus} isMerged={pr.state === "MERGED"} />
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

          {/* Tab bar */}
          <div className="flex border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "description" && (
            <>
              {/* Body */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Description
                </h3>
                {pr.body ? (
                  <div className="prose prose-invert prose-sm max-w-none font-sans text-[14px] rounded-lg border border-border bg-card p-4 prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
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
                          <div className="prose prose-invert prose-sm mt-1.5 max-w-none font-sans text-[14px] prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                              {review.body}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === "checks" && (
            <ChecksTab
              checkRuns={checkRuns}
              loading={checksLoading}
              error={checksError}
              isMerged={pr.state === "MERGED"}
            />
          )}

          {activeTab === "comments" && (
            <CommentsTab
              comments={comments}
              loading={commentsLoading}
              error={commentsError}
              onToggleResolved={(threadId: string, resolved: boolean) => {
                const update = (val: boolean) =>
                  setComments((prev) => {
                    if (!prev) return prev;
                    return Object.assign(Object.create(Object.getPrototypeOf(prev)), {
                      ...prev,
                      reviewThreads: prev.reviewThreads.map((t) =>
                        t.id === threadId
                          ? Object.assign(Object.create(Object.getPrototypeOf(t)), { ...t, isResolved: val })
                          : t
                      ),
                    });
                  });
                // Optimistically update local state.
                update(resolved);
                // Fire API call, revert on failure.
                const call = resolved ? ResolveThread(threadId) : UnresolveThread(threadId);
                call.catch(() => update(!resolved));
              }}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <SidebarSection title="Actions">
            <div className="space-y-2">
              {pr.state === "OPEN" && (
                <DetailApproveButton prNodeId={pr.nodeId} reviews={pr.reviews} author={pr.author} triggerRef={approveRef} />
              )}
              {pr.state === "OPEN" && (
                <DetailMergeButton
                  prNodeId={pr.nodeId}
                  mergeable={pr.mergeable}
                  isDraft={pr.isDraft}
                  onMerged={() => navigate(-1)}
                  triggerRef={mergeToggleRef}
                />
              )}
              <button
                onClick={() => BrowserOpenURL(pr.url)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                <ExternalLink className="h-4 w-4" />
                Open in GitHub
              </button>
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

          {/* Reviewers: completed reviews + pending requests */}
          <ReviewersSidebar reviews={pr.reviews} reviewRequests={pr.reviewRequests} prNodeId={pr.nodeId} isOpen={pr.state === "OPEN"} triggerRef={reviewerToggleRef} />

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

// ---- Action button components (detail page) ----

const mergeOptions = [
  { method: "MERGE", label: "Create a merge commit" },
  { method: "SQUASH", label: "Squash and merge" },
  { method: "REBASE", label: "Rebase and merge" },
] as const;

/** Prominent merge button with method dropdown for the detail page sidebar. */
function DetailMergeButton({
  prNodeId,
  mergeable,
  isDraft,
  onMerged,
  triggerRef,
}: {
  prNodeId: string;
  mergeable: string;
  isDraft: boolean;
  onMerged?: () => void;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const { mergePR } = usePRStore();

  const canMerge = !isDraft && mergeable === "MERGEABLE";

  // Expose toggle to parent via triggerRef.
  useEffect(() => {
    if (triggerRef) triggerRef.current = () => { if (canMerge) setIsOpen((o) => !o); };
    return () => { if (triggerRef) triggerRef.current = null; };
  }, [triggerRef, canMerge]);

  // Register vim escape override to close dropdown instead of navigating back.
  useEffect(() => {
    if (isOpen) {
      useVimStore.setState({ onEscape: () => setIsOpen(false) });
      return () => useVimStore.setState({ onEscape: null });
    }
  }, [isOpen]);

  const handleMerge = async (method: string) => {
    setIsMerging(true);
    setMergeError(null);
    try {
      const result = await mergePR(prNodeId, method);
      setMergeResult(result);
      setIsOpen(false);
      if (result === "merged") onMerged?.();
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMerging(false);
    }
  };

  // Show enqueued state
  if (mergeResult === "enqueued") {
    return (
      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-900/40 px-3 py-2 text-sm font-medium text-green-400">
        <CheckCircle className="h-4 w-4" />
        Added to merge queue
      </div>
    );
  }

  const title = !canMerge
    ? isDraft
      ? "Cannot merge draft PRs"
      : mergeable === "CONFLICTING"
        ? "This branch has conflicts"
        : "Cannot merge this PR"
    : "Merge this pull request";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!canMerge || isMerging}
        title={title}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GitMerge className={`h-4 w-4 ${isMerging ? "animate-pulse" : ""}`} />
        Merge
        <ChevronDown className="ml-auto h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
          <div className="p-1">
            {mergeOptions.map((opt) => (
              <button
                key={opt.method}
                onClick={() => handleMerge(opt.method)}
                disabled={isMerging}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-popover-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <GitMerge className="h-3.5 w-3.5 text-green-500" />
                {opt.label}
              </button>
            ))}
          </div>
          {mergeError && (
            <div className="border-t border-border px-2 py-1.5 text-xs text-destructive">
              {mergeError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Prominent approve button for the detail page sidebar. */
function DetailApproveButton({
  prNodeId,
  reviews,
  author,
  triggerRef,
}: {
  prNodeId: string;
  reviews: github.Review[] | null;
  author: string;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [isApproving, setIsApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { approvePR } = usePRStore();
  const viewerLogin = useAuthStore((s) => s.user?.login);

  // You cannot approve your own PR
  const isOwnPR = !!viewerLogin && viewerLogin === author;

  // Check if the viewer has already approved this PR
  const alreadyApproved = useMemo(() => {
    if (!reviews || !viewerLogin) return false;
    const viewerReviews = reviews.filter((r) => r.author === viewerLogin);
    if (viewerReviews.length === 0) return false;
    const latest = viewerReviews.reduce((a, b) => {
      const aTs = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bTs = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bTs > aTs ? b : a;
    });
    return latest.state === "APPROVED";
  }, [reviews, viewerLogin]);

  const handleApprove = async () => {
    setIsApproving(true);
    setError(null);
    try {
      await approvePR(prNodeId);
      setApproved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApproving(false);
    }
  };

  // Expose approve to parent via triggerRef.
  useEffect(() => {
    if (triggerRef) {
      triggerRef.current = () => {
        if (!isOwnPR && !alreadyApproved && !approved && !isApproving) handleApprove();
      };
    }
    return () => { if (triggerRef) triggerRef.current = null; };
  });

  if (approved || alreadyApproved) {
    return (
      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-900/40 px-3 py-2 text-sm font-medium text-green-400">
        <CheckCircle className="h-4 w-4" />
        Approved
      </div>
    );
  }

  const disabled = isApproving || isOwnPR;
  const title = isOwnPR
    ? "You cannot approve your own pull request"
    : "Approve this pull request";

  return (
    <div>
      <button
        onClick={handleApprove}
        disabled={disabled}
        title={title}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-green-600 bg-transparent px-3 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-600/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ThumbsUp className={`h-4 w-4 ${isApproving ? "animate-pulse" : ""}`} />
        {isApproving ? "Approving..." : "Approve"}
      </button>
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

// ---- Tab components ----

/** Icon for a check run based on its status + conclusion. */
function CheckRunIcon({ status, conclusion, isMerged }: { status: string; conclusion: string; isMerged: boolean }) {
  // In-progress
  if (status === "IN_PROGRESS" || status === "QUEUED" || status === "PENDING" || status === "WAITING") {
    if (isMerged) return <Circle className="h-4 w-4 text-muted-foreground" />;
    return <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />;
  }
  // Completed — check conclusion
  if (conclusion === "SUCCESS" || conclusion === "NEUTRAL" || conclusion === "SKIPPED") {
    return <CheckCircle className="h-4 w-4 text-green-400" />;
  }
  if (conclusion === "FAILURE" || conclusion === "TIMED_OUT" || conclusion === "CANCELLED" || conclusion === "STARTUP_FAILURE") {
    return <XCircle className="h-4 w-4 text-red-400" />;
  }
  if (conclusion === "ACTION_REQUIRED") {
    return <Circle className="h-4 w-4 text-yellow-400" />;
  }
  // Fallback
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function ChecksTab({
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
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
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

  // Group by conclusion for a summary
  const passed = checkRuns.filter((c) => c.conclusion === "SUCCESS" || c.conclusion === "NEUTRAL" || c.conclusion === "SKIPPED");
  const failed = checkRuns.filter((c) => c.conclusion === "FAILURE" || c.conclusion === "TIMED_OUT" || c.conclusion === "CANCELLED" || c.conclusion === "STARTUP_FAILURE");
  const pending = checkRuns.filter((c) => !c.conclusion || c.status === "IN_PROGRESS" || c.status === "QUEUED" || c.status === "PENDING" || c.status === "WAITING");

  return (
    <section className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        {passed.length > 0 && (
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle className="h-4 w-4" /> {passed.length} passed
          </span>
        )}
        {failed.length > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <XCircle className="h-4 w-4" /> {failed.length} failed
          </span>
        )}
        {pending.length > 0 && (
          <span className="flex items-center gap-1 text-yellow-400">
            <Loader2 className="h-4 w-4" /> {pending.length} pending
          </span>
        )}
      </div>

      {/* Individual checks */}
      <div className="space-y-1">
        {checkRuns.map((check, i) => (
          <div
            key={check.name + i}
            ref={(el) => { itemRefs.current[i] = el; }}
            className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${
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
              <button
                onClick={() => BrowserOpenURL(check.detailsUrl)}
                className="ml-1 text-muted-foreground transition-colors hover:text-foreground"
                title="View details"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CommentsTab({
  comments,
  loading,
  error,
  onToggleResolved,
}: {
  comments: github.PRComments | null;
  loading: boolean;
  error: string | null;
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
}) {
  const selectedIndex = useVimStore((s) => s.selectedIndex);
  const hideCopilot = useSettingsStore((s) => s.hideCopilotReviews);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const COPILOT_BOT = "copilot-pull-request-reviewer[bot]";

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
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-400">
        Failed to load comments: {error}
      </div>
    );
  }

  const rawIssueComments = comments?.issueComments || [];
  const rawReviewThreads = comments?.reviewThreads || [];

  const issueComments = hideCopilot
    ? rawIssueComments.filter((c) => c.author !== COPILOT_BOT)
    : rawIssueComments;
  const reviewThreads = hideCopilot
    ? rawReviewThreads.filter((t) => !(t.comments?.length > 0 && t.comments[0].author === COPILOT_BOT))
    : rawReviewThreads;
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
            {issueComments.map((comment, i) => (
              <div
                key={comment.id}
                ref={(el) => { itemRefs.current[i] = el; }}
                onClick={() => { if (comment.url) BrowserOpenURL(comment.url); }}
                className={`cursor-pointer rounded-lg transition-colors hover:ring-1 hover:ring-muted-foreground/30 ${
                  i === selectedIndex ? "ring-1 ring-primary ring-offset-1 ring-offset-background" : ""
                }`}
              >
                <CommentCard
                  author={comment.author}
                  authorAvatar={comment.authorAvatar}
                  body={comment.body}
                  createdAt={comment.createdAt}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review threads (inline code comments) */}
      {reviewThreads.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Review threads ({reviewThreads.length})
          </h3>
          <div className="space-y-3">
            {reviewThreads.map((thread, i) => {
              const globalIdx = issueComments.length + i;
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
                {/* Thread header */}
                <div
                  onClick={() => { if (thread.url) BrowserOpenURL(thread.url); }}
                  className="flex cursor-pointer items-center gap-2 border-b border-border px-4 py-2 hover:bg-muted/30"
                >
                  <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                  <code className="truncate text-xs text-muted-foreground">
                    {thread.path}
                    {thread.line > 0 && `:${thread.line}`}
                  </code>
                  {thread.isResolved ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleResolved?.(thread.id, false); }}
                      className="ml-auto rounded-full bg-green-900/60 px-1.5 py-0.5 text-[10px] font-medium text-green-300 transition-colors hover:bg-green-900/80"
                      title="Unresolve thread"
                    >
                      Resolved
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleResolved?.(thread.id, true); }}
                      className="ml-auto rounded-full bg-yellow-900/60 px-1.5 py-0.5 text-[10px] font-medium text-yellow-300 transition-colors hover:bg-yellow-900/80"
                      title="Resolve thread"
                    >
                      Unresolved
                    </button>
                  )}
                </div>
                {/* Thread comments */}
                <div className="divide-y divide-border">
                  {(thread.comments || []).map((comment) => (
                    <CommentCard
                      key={comment.id}
                      author={comment.author}
                      authorAvatar={comment.authorAvatar}
                      body={comment.body}
                      createdAt={comment.createdAt}
                      compact
                    />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Reusable comment card for both issue comments and review thread comments. */
function CommentCard({
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
        <div className="prose prose-invert prose-sm mt-1.5 max-w-none font-sans text-[14px] prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
            {body}
          </ReactMarkdown>
        </div>
      )}
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

/**
 * Sidebar section that shows:
 * - Latest review state per unique reviewer (deduplicated, latest non-COMMENTED wins)
 * - Pending review requests that haven't submitted a review yet
 */
function ReviewersSidebar({
  reviews,
  reviewRequests,
  prNodeId,
  isOpen,
  triggerRef,
}: {
  reviews: github.Review[] | null;
  reviewRequests: github.ReviewRequest[] | null;
  prNodeId: string;
  isOpen: boolean;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const latestReviews = useMemo(() => {
    if (!reviews || reviews.length === 0) return [];

    // For each author, find their latest meaningful review state.
    // Priority: APPROVED / CHANGES_REQUESTED > DISMISSED > COMMENTED > PENDING
    // If only COMMENTED reviews exist, still show them.
    const byAuthor = new Map<string, github.Review>();
    for (const r of reviews) {
      const existing = byAuthor.get(r.author);
      if (!existing) {
        byAuthor.set(r.author, r);
        continue;
      }
      // Take whichever was submitted later
      const existingTs = existing.submittedAt ? new Date(existing.submittedAt).getTime() : 0;
      const currentTs = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
      if (currentTs > existingTs) {
        byAuthor.set(r.author, r);
      }
    }
    return Array.from(byAuthor.values());
  }, [reviews]);

  // Pending requests that don't have a completed review
  const pendingRequests = useMemo(() => {
    if (!reviewRequests || reviewRequests.length === 0) return [];
    const reviewedAuthors = new Set(latestReviews.map((r) => r.author));
    return reviewRequests.filter((rr) => !reviewedAuthors.has(rr.reviewer));
  }, [reviewRequests, latestReviews]);

  const hasReviewers = latestReviews.length > 0 || pendingRequests.length > 0;

  if (!hasReviewers && !isOpen) return null;

  return (
    <SidebarSection title="Reviewers">
      <div className="space-y-1.5">
        {latestReviews.map((review) => (
          <div key={review.author} className="flex items-center gap-2">
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
            <span className="text-sm text-foreground">{review.author}</span>
            <span className="ml-auto">
              <ReviewStateBadge state={review.state} />
            </span>
          </div>
        ))}
        {pendingRequests.map((rr, i) => (
          <div key={`pending-${i}`} className="flex items-center gap-2">
            {rr.reviewerType === "team" ? (
              <Users className="h-5 w-5 text-muted-foreground" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">{rr.reviewer}</span>
              <span className="ml-auto">
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                Pending
              </span>
              </span>
          </div>
        ))}
        {isOpen && (
          <ReviewerAssign
            prNodeId={prNodeId}
            currentReviewers={(reviewRequests || []).map((rr) => rr.reviewer)}
            triggerRef={triggerRef}
          />
        )}
      </div>
    </SidebarSection>
  );
}
