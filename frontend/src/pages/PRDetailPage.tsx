import { useMemo, useState, useEffect, useRef, useCallback } from "react";
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
  ChevronRight,
  Terminal,
  Download,
  Sparkles,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { BrowserOpenURL, EventsOn } from "../../wailsjs/runtime/runtime";
import { GetPRCheckRuns, GetPRComments, GetPRCommits, GetPRFiles, GetSinglePR, ResolveThread, UnresolveThread } from "../../wailsjs/go/services/PullRequestService";
import { CheckToolAvailability, CheckoutPR, OpenTerminal as OpenTerminalInRepo, StartAIReview, CancelAIReview, GetCurrentBranch, GetAIReview, DeleteAIReview, StartGenerateDescription, CancelGenerateDescription, ApplyPRDescription, StartGenerateTitle, CancelGenerateTitle, ApplyPRTitle } from "../../wailsjs/go/services/WorkspaceService";
import { copyToClipboard } from "../lib/clipboard";

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
import { useFlagStore } from "@/stores/flagStore";
import { useRepoStore } from "@/stores/repoStore";
import { useToast } from "@/components/ui/Toast";
import { github, services } from "../../wailsjs/go/models";
import { timeAgo } from "@/lib/utils";

type DetailTab = "description" | "checks" | "comments" | "files" | "commits" | "ai-review";
import { StateBadge } from "@/components/pr/StateBadge";
import { PRSizeBadge } from "@/components/pr/PRSizeBadge";
import { ReviewStatusBadge } from "@/components/pr/ReviewStatusBadge";
import { ChecksStatusIcon } from "@/components/pr/ChecksStatusIcon";
import { ReviewerAssign } from "@/components/pr/ReviewerAssign";
import { DiffView } from "@/components/pr/DiffView";

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

  // The PR to display: prefer the independently fetched version (from manual refresh)
  // over the store copy, since the store only updates on background poll cycles.
  const pr = fetchedPR ?? storePR ?? undefined;

  const getFlagReasons = useFlagStore((s) => s.getFlagReasons);
  const flagRules = useFlagStore((s) => s.rules);
  const flagReasons = useMemo(
    () => (pr ? getFlagReasons(pr) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pr, flagRules],
  );

  const filteredReviewUsers = useSettingsStore((s) => s.filteredReviewUsers);

  // Filter out reviews authored by users in the "Filtered Review Users" list.
  const filteredReviews = useMemo(() => {
    if (!pr?.reviews) return null;
    if (filteredReviewUsers.length === 0) return pr.reviews;
    const blocked = new Set(filteredReviewUsers.map((u) => u.toLowerCase()));
    return pr.reviews.filter((r) => !blocked.has((r.author || "").toLowerCase()));
  }, [pr?.reviews, filteredReviewUsers]);

  const [activeTab, setActiveTab] = useState<DetailTab>("description");

  // Lazy-loaded check runs
  const [checkRuns, setCheckRuns] = useState<github.CheckRun[] | null>(null);
  const [checksLoading, setChecksLoading] = useState(false);
  const [checksError, setChecksError] = useState<string | null>(null);

  // Lazy-loaded comments
  const [comments, setComments] = useState<github.PRComments | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  // Lazy-loaded files (diff view)
  const [prFiles, setPRFiles] = useState<github.PRFile[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  // Expanded files state — lifted here so it persists across tab switches and auto-refreshes.
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Lazy-loaded commits
  const [commits, setCommits] = useState<github.PRCommit[] | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);

  // Workspace: tool availability, checkout state, current branch, Claude review
  const { addToast } = useToast();
  const repos = useRepoStore((s) => s.repos);
  const [toolAvailability, setToolAvailability] = useState<services.ToolAvailability | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);

  // AI review state
  const [aiReviewing, setAiReviewing] = useState(false);
  const [aiResult, setAiResult] = useState<{ result: string; cost: number; duration: number; createdAt: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI description generation state
  const [descGenerating, setDescGenerating] = useState(false);
  const [generatedDesc, setGeneratedDesc] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const [applyingDesc, setApplyingDesc] = useState(false);

  // AI title generation state
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [applyingTitle, setApplyingTitle] = useState(false);

  // Check if this PR's repo is tracked locally
  const trackedRepo = useMemo(() => {
    if (!pr) return undefined;
    return repos.find((r) => r.repoOwner === pr.repoOwner && r.repoName === pr.repoName);
  }, [repos, pr]);
  const hasLocalPath = !!trackedRepo?.localPath;

  // Check tool availability on mount
  useEffect(() => {
    CheckToolAvailability()
      .then((tools) => {
        console.log("[review-deck] tool availability:", tools);
        setToolAvailability(tools);
      })
      .catch((err) => {
        console.error("[review-deck] failed to check tool availability:", err);
      });
  }, []);

  // Fetch current branch when PR loads (for checkout button label)
  useEffect(() => {
    if (!pr || !hasLocalPath) return;
    GetCurrentBranch(pr.repoOwner, pr.repoName).then(setCurrentBranch).catch(() => {});
  }, [pr?.repoOwner, pr?.repoName, hasLocalPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load cached AI review on mount
  useEffect(() => {
    if (!pr?.nodeId) return;
    GetAIReview(pr.nodeId).then((cached) => {
      if (cached && cached.review) {
        setAiResult({
          result: cached.review,
          cost: cached.cost ?? 0,
          duration: cached.duration ?? 0,
          createdAt: cached.created_at ?? "",
        });
      }
    }).catch(() => {});
  }, [pr?.nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for AI review events
  useEffect(() => {
    const offStarted = EventsOn("ai:started", () => {
      setAiReviewing(true);
      setAiResult(null);
      setAiError(null);
    });
    const offResult = EventsOn("ai:result", (data: { review: string; cost: number; duration: number; created_at: string }) => {
      setAiReviewing(false);
      setAiResult({
        result: data.review,
        cost: data.cost ?? 0,
        duration: (data.duration ?? 0) / 1000,
        createdAt: data.created_at ?? "",
      });
    });
    const offError = EventsOn("ai:error", (data: { error: string }) => {
      setAiReviewing(false);
      setAiError(data.error);
    });
    return () => {
      offStarted();
      offResult();
      offError();
    };
  }, []);

  // Listen for description generation events
  useEffect(() => {
    const offStarted = EventsOn("description:started", () => {
      setDescGenerating(true);
      setGeneratedDesc(null);
      setDescError(null);
    });
    const offResult = EventsOn("description:result", (data: { description: string; cost: number; duration: number }) => {
      setDescGenerating(false);
      setGeneratedDesc(data.description);
    });
    const offError = EventsOn("description:error", (data: { error: string }) => {
      setDescGenerating(false);
      setDescError(data.error);
    });
    return () => {
      offStarted();
      offResult();
      offError();
    };
  }, []);

  // Listen for title generation events
  useEffect(() => {
    const offStarted = EventsOn("title:started", () => {
      setTitleGenerating(true);
      setGeneratedTitle(null);
      setTitleError(null);
    });
    const offResult = EventsOn("title:result", (data: { title: string }) => {
      setTitleGenerating(false);
      setGeneratedTitle(data.title);
    });
    const offError = EventsOn("title:error", (data: { error: string }) => {
      setTitleGenerating(false);
      setTitleError(data.error);
    });
    return () => {
      offStarted();
      offResult();
      offError();
    };
  }, []);

  const handleCheckout = useCallback(async () => {
    if (!pr || checkingOut) return;
    setCheckingOut(true);
    try {
      await CheckoutPR(pr.repoOwner, pr.repoName, pr.number);
      setCurrentBranch(pr.headRef);
      addToast(`Checked out ${pr.headRef}`, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setCheckingOut(false);
    }
  }, [pr, checkingOut, addToast]);

  const handleOpenTerminal = useCallback(async () => {
    if (!pr) return;
    try {
      await OpenTerminalInRepo(pr.repoOwner, pr.repoName);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [pr, addToast]);

  const handleStartAIReview = useCallback(async () => {
    if (!pr || aiReviewing) return;
    try {
      // Clear cached review so re-run always fetches fresh.
      await DeleteAIReview(pr.nodeId);
      setAiResult(null);
      await StartAIReview(pr.repoOwner, pr.repoName, pr.number, pr.nodeId);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [pr, aiReviewing, addToast]);

  const handleCancelAIReview = useCallback(async () => {
    try {
      await CancelAIReview();
      setAiReviewing(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [addToast]);

  const handleGenerateDescription = useCallback(async () => {
    if (!pr || descGenerating) return;
    try {
      setGeneratedDesc(null);
      setDescError(null);
      await StartGenerateDescription(pr.repoOwner, pr.repoName, pr.number);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [pr, descGenerating, addToast]);

  const handleCancelDescription = useCallback(async () => {
    try {
      await CancelGenerateDescription();
      setDescGenerating(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [addToast]);

  const handleApplyDescription = useCallback(async () => {
    if (!pr || !generatedDesc || applyingDesc) return;
    setApplyingDesc(true);
    try {
      await ApplyPRDescription(pr.repoOwner, pr.repoName, pr.number, generatedDesc);
      addToast("PR description updated on GitHub", "success");
      // Refresh the PR to show the updated body.
      setRefreshing(true);
      try {
        const updated = await GetSinglePR(pr.repoOwner, pr.repoName, pr.number);
        if (updated) setFetchedPR(updated);
      } catch {}
      setRefreshing(false);
      setGeneratedDesc(null);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setApplyingDesc(false);
    }
  }, [pr, generatedDesc, applyingDesc, addToast]);

  const handleGenerateTitle = useCallback(async () => {
    if (!pr || titleGenerating) return;
    try {
      setGeneratedTitle(null);
      setTitleError(null);
      await StartGenerateTitle(pr.repoOwner, pr.repoName, pr.number, pr.headRef);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [pr, titleGenerating, addToast]);

  const handleCancelTitle = useCallback(async () => {
    try {
      await CancelGenerateTitle();
      setTitleGenerating(false);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    }
  }, [addToast]);

  const handleApplyTitle = useCallback(async () => {
    if (!pr || !generatedTitle || applyingTitle) return;
    setApplyingTitle(true);
    try {
      await ApplyPRTitle(pr.repoOwner, pr.repoName, pr.number, generatedTitle);
      addToast("PR title updated on GitHub", "success");
      // Refresh the PR to show the updated title.
      setRefreshing(true);
      try {
        const updated = await GetSinglePR(pr.repoOwner, pr.repoName, pr.number);
        if (updated) setFetchedPR(updated);
      } catch {}
      setRefreshing(false);
      setGeneratedTitle(null);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setApplyingTitle(false);
    }
  }, [pr, generatedTitle, applyingTitle, addToast]);

  // Refs for triggering keybinding actions on child components.
  const reviewerToggleRef = useRef<(() => void) | null>(null);
  const mergeToggleRef = useRef<(() => void) | null>(null);
  const approveRef = useRef<(() => void) | null>(null);
  const fileToggleRef = useRef<(() => void) | null>(null);
  const commentToggleRef = useRef<(() => void) | null>(null);
  const commentResolveRef = useRef<(() => void) | null>(null);
  const commentUnresolveRef = useRef<(() => void) | null>(null);
  const requestChangesRef = useRef<(() => void) | null>(null);

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

  // Fetch files when the files tab is first selected
  useEffect(() => {
    if (activeTab !== "files" || prFiles !== null || filesLoading || !pr) return;
    setFilesLoading(true);
    GetPRFiles(pr.repoOwner, pr.repoName, pr.number)
      .then(setPRFiles)
      .catch((err) => setFilesError(String(err)))
      .finally(() => setFilesLoading(false));
  }, [activeTab, prFiles, filesLoading, pr]);

  // Fetch commits when the commits tab is first selected
  useEffect(() => {
    if (activeTab !== "commits" || commits !== null || commitsLoading || !nodeId) return;
    setCommitsLoading(true);
    GetPRCommits(nodeId)
      .then((c) => setCommits(c ? [...c].reverse() : c))
      .catch((err) => setCommitsError(String(err)))
      .finally(() => setCommitsLoading(false));
  }, [activeTab, commits, commitsLoading, nodeId]);

  // Keep a ref to the latest PR info so the auto-refresh interval always
  // has access to current owner/repo/number without stale closures.
  const prRef = useRef<{ owner: string; repo: string; number: number } | null>(null);
  useEffect(() => {
    if (pr) prRef.current = { owner: pr.repoOwner, repo: pr.repoName, number: pr.number };
  }, [pr]);

  // Ref to track whether a refresh is in progress (avoids stale closure issues).
  const refreshingRef = useRef(false);

  /** Refresh the PR by re-fetching from GitHub. */
  const handleRefresh = async () => {
    const info = prRef.current;
    if (!info || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await GetSinglePR(info.owner, info.repo, info.number);
      setFetchedPR(fresh);
      // Also reset lazy-loaded tab data so they re-fetch on next view.
      setCheckRuns(null);
      setChecksError(null);
      setComments(null);
      setCommentsError(null);
      setPRFiles(null);
      setFilesError(null);
      setCommits(null);
      setCommitsError(null);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };

  // Auto-fetch fresh PR data on mount (the store copy may be stale).
  useEffect(() => {
    if (storePR && !fetchedPR) {
      handleRefresh();
    }
  }, [storePR?.nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh at the configured interval.
  const prRefreshIntervalSeconds = useSettingsStore((s) => s.prRefreshIntervalSeconds);
  useEffect(() => {
    const ms = prRefreshIntervalSeconds * 1000;
    const interval = setInterval(() => {
      if (prRef.current && !refreshingRef.current) {
        handleRefresh();
      }
    }, ms);
    return () => clearInterval(interval);
  }, [prRefreshIntervalSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } else if (activeTab === "files") {
      useVimStore.getState().setListLength(prFiles?.length ?? 0);
    } else if (activeTab === "commits") {
      useVimStore.getState().setListLength(commits?.length ?? 0);
    } else if (activeTab === "ai-review") {
      // Length 1 + selectedIndex 0 so Enter fires immediately without needing j first.
      useVimStore.getState().setListLength(1);
      useVimStore.getState().setSelectedIndex(0);
    } else if (activeTab === "description") {
      // Length 1 + selectedIndex 0 so Enter fires immediately without needing j first.
      useVimStore.getState().setListLength(1);
      useVimStore.getState().setSelectedIndex(0);
    } else {
      useVimStore.getState().setListLength(0);
    }
  }, [activeTab, checkRuns, comments]);

  // Register VIM actions for the detail page.
  // h/l cycle tabs, j/k scroll (description) or navigate items (checks/comments).
  useEffect(() => {
    const tabKeys: DetailTab[] = ["description", "checks", "comments", "files", "commits", "ai-review"];
    const currentIdx = tabKeys.indexOf(activeTab);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actions: any = {
      onGoBack: () => navigate(-1),
      onRefresh: handleRefresh,
      onTabNext: () => setActiveTab(tabKeys[(currentIdx + 1) % tabKeys.length]),
      onTabPrev: () => setActiveTab(tabKeys[(currentIdx - 1 + tabKeys.length) % tabKeys.length]),
      onTabDirect: (idx: number) => { if (idx >= 0 && idx < tabKeys.length) setActiveTab(tabKeys[idx]); },
      onAssignReviewer: () => reviewerToggleRef.current?.(),
      onMerge: () => mergeToggleRef.current?.(),
      onApprove: () => approveRef.current?.(),
      onRequestChanges: () => requestChangesRef.current?.(),
      onCopy: () => { if (pr) copyToClipboard(pr.url); },
    };

    if (activeTab === "description") {
      const scrollEl = document.getElementById("scroll-region");
      actions.onMoveDown = () => scrollEl?.scrollBy(0, 150);
      actions.onMoveUp = () => scrollEl?.scrollBy(0, -150);
      actions.onOpenExternal = () => { if (pr) BrowserOpenURL(pr.url); };
      // Enter generates a PR description (when tools are available and not already generating).
      if (hasLocalPath && toolAvailability?.gh && toolAvailability?.claude) {
        actions.onOpen = () => { if (!descGenerating) handleGenerateDescription(); };
        actions.onGenerate = () => { if (!descGenerating) handleGenerateDescription(); };
        actions.onGenerateTitle = () => { if (!titleGenerating) handleGenerateTitle(); };
      }
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
      actions.onSpace = () => commentToggleRef.current?.();
      actions.onResolve = () => commentResolveRef.current?.();
      actions.onUnresolve = () => commentUnresolveRef.current?.();
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
    } else if (activeTab === "files") {
      actions.onSpace = () => fileToggleRef.current?.();
      actions.onOpenExternal = () => { if (pr) BrowserOpenURL(pr.url); };
    } else if (activeTab === "commits") {
      actions.onOpenExternal = (idx: number) => {
        if (commits && commits[idx]?.oid && pr) {
          BrowserOpenURL(`${pr.url}/commits/${commits[idx].oid}`);
        } else if (pr) {
          BrowserOpenURL(pr.url);
        }
      };
    } else if (activeTab === "ai-review") {
      const scrollEl = document.getElementById("scroll-region");
      actions.onMoveDown = () => scrollEl?.scrollBy(0, 150);
      actions.onMoveUp = () => scrollEl?.scrollBy(0, -150);
      actions.onOpenExternal = () => { if (pr) BrowserOpenURL(pr.url); };
      // Enter starts a review (idle), re-runs (result shown), or retries (error).
      actions.onOpen = () => { if (!aiReviewing) handleStartAIReview(); };
      actions.onGenerate = () => { if (!aiReviewing) handleStartAIReview(); };
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
    { key: "files", label: "Files", icon: <FileCode className="h-4 w-4" /> },
    { key: "commits", label: "Commits", icon: <GitCommit className="h-4 w-4" /> },
    { key: "ai-review", label: "AI Review", icon: <Sparkles className="h-4 w-4" /> },
  ];

  return (
    <div className="min-w-0 space-y-4">
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
          <StateBadge state={pr.state} isDraft={pr.isDraft} isInMergeQueue={pr.isInMergeQueue} />
          <ReviewStatusBadge reviewDecision={pr.reviewDecision} />
          <ChecksStatusIcon status={pr.checksStatus} isMerged={pr.state === "MERGED"} />
          {pr.mergeable === "CONFLICTING" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/60 dark:text-red-200">
              <AlertTriangle className="h-3 w-3" />
              Conflicts
            </span>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          {/* Author + timestamps */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
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
            {tabs.map((tab, idx) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
                <kbd className="ml-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">
                  {idx + 1}
                </kbd>
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "description" && (
            <>
              {/* Body */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Description
                  </h3>
                  {hasLocalPath && toolAvailability?.gh && toolAvailability?.claude && (
                    <div className="flex items-center gap-1.5">
                      {titleGenerating ? (
                        <button
                          onClick={handleCancelTitle}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <XCircle className="h-3 w-3" />
                          Cancel Title
                        </button>
                      ) : (
                        <button
                          onClick={handleGenerateTitle}
                          disabled={titleGenerating || descGenerating}
                          title="Generate a PR title using AI"
                          className="inline-flex items-center gap-1 rounded-md border border-purple-500/50 px-2 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-purple-300"
                        >
                          <Sparkles className="h-3 w-3" />
                          Title
                          <kbd className="ml-0.5 rounded bg-purple-500/10 px-1 py-0.5 font-mono text-[10px] text-purple-400/60">H</kbd>
                        </button>
                      )}
                      {descGenerating ? (
                        <button
                          onClick={handleCancelDescription}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <XCircle className="h-3 w-3" />
                          Cancel Desc
                        </button>
                      ) : (
                        <button
                          onClick={handleGenerateDescription}
                          disabled={descGenerating || titleGenerating}
                          title="Generate a PR description using AI"
                          className="inline-flex items-center gap-1 rounded-md border border-purple-500/50 px-2 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-purple-300"
                        >
                          <Sparkles className="h-3 w-3" />
                          Description
                          <kbd className="ml-0.5 rounded bg-purple-500/10 px-1 py-0.5 font-mono text-[10px] text-purple-400/60">G</kbd>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* AI title generation in progress */}
                {titleGenerating && (
                  <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3 text-sm text-purple-700 dark:text-purple-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating title...
                  </div>
                )}

                {/* AI title generation error */}
                {titleError && !titleGenerating && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <div className="flex items-center justify-between">
                      <span>{titleError}</span>
                      <button
                        onClick={handleGenerateTitle}
                        className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:bg-destructive/10"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {/* AI-generated title preview */}
                {generatedTitle && !titleGenerating && (
                  <div className="space-y-2 rounded-lg border-2 border-purple-500/40 bg-purple-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                        AI-Generated Title
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleGenerateTitle}
                          title="Regenerate title"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                        <button
                          onClick={() => setGeneratedTitle(null)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <XCircle className="h-3 w-3" />
                          Discard
                        </button>
                        <button
                          onClick={handleApplyTitle}
                          disabled={applyingTitle}
                          className="inline-flex items-center gap-1 rounded-md border border-green-600 bg-green-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {applyingTitle ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          {applyingTitle ? "Applying..." : "Apply to PR"}
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      <p className="text-sm font-medium text-foreground">{generatedTitle}</p>
                    </div>
                  </div>
                )}

                {/* AI description generation in progress */}
                {descGenerating && (
                  <div className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3 text-sm text-purple-700 dark:text-purple-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating description...
                  </div>
                )}

                {/* AI description generation error */}
                {descError && !descGenerating && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <div className="flex items-center justify-between">
                      <span>{descError}</span>
                      <button
                        onClick={handleGenerateDescription}
                        className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:bg-destructive/10"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {/* AI-generated description preview */}
                {generatedDesc && !descGenerating && (
                  <div className="space-y-2 rounded-lg border-2 border-purple-500/40 bg-purple-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                        AI-Generated Preview
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleGenerateDescription}
                          title="Regenerate description"
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                        <button
                          onClick={() => setGeneratedDesc(null)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <XCircle className="h-3 w-3" />
                          Discard
                        </button>
                        <button
                          onClick={handleApplyDescription}
                          disabled={applyingDesc}
                          className="inline-flex items-center gap-1 rounded-md border border-green-600 bg-green-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {applyingDesc ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          {applyingDesc ? "Applying..." : "Apply to PR"}
                        </button>
                      </div>
                    </div>
                    <div className="prose dark:prose-invert prose-sm max-w-none font-sans text-[14px] rounded-lg border border-border bg-card p-3 prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-thead:border-border prose-tr:border-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                        {generatedDesc}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Existing PR body */}
                {!generatedDesc && !descGenerating && !descError && (
                  pr.body ? (
                    <div className="prose dark:prose-invert prose-sm max-w-none font-sans text-[14px] rounded-lg border border-border bg-card p-3 prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-thead:border-border prose-tr:border-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                        {pr.body}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm italic text-muted-foreground">
                      No description provided.
                    </p>
                  )
                )}
              </section>

              {/* Reviews */}
              {filteredReviews && filteredReviews.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Reviews
                  </h3>
                  <div className="space-y-2">
                    {filteredReviews.map((review, i) => (
                      <div
                        key={review.id || i}
                        className="rounded-lg border border-border bg-card px-3 py-2"
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
                          <div className="prose dark:prose-invert prose-sm mt-1.5 max-w-none font-sans text-[14px] prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-thead:border-border prose-tr:border-border">
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
              toggleSelectedRef={commentToggleRef}
              resolveRef={commentResolveRef}
              unresolveRef={commentUnresolveRef}
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

          {activeTab === "files" && (
            <DiffView
              files={prFiles}
              loading={filesLoading}
              error={filesError}
              owner={pr.repoOwner}
              repo={pr.repoName}
              toggleSelectedRef={fileToggleRef}
              expandedFiles={expandedFiles}
              onExpandedFilesChange={setExpandedFiles}
            />
          )}

          {activeTab === "commits" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Commits ({commits?.length ?? pr.commitCount})
              </h3>
              {commitsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-sm">Loading commits...</span>
                </div>
              ) : commitsError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {commitsError}
                </div>
              ) : commits && commits.length > 0 ? (
                <ul className="space-y-1">
                  {commits.map((commit, idx) => {
                    const selected = useVimStore.getState().selectedIndex === idx;
                    return (
                      <li
                        key={commit.oid}
                        data-idx={idx}
                        className={`group flex items-start gap-3 rounded-md border px-3 py-2 transition-colors ${
                          selected
                            ? "ring-1 ring-primary bg-accent/40 border-primary/50"
                            : "border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {commit.authorAvatar ? (
                            <img
                              src={commit.authorAvatar}
                              alt={commit.authorLogin || commit.authorName}
                              className="h-6 w-6 rounded-full"
                            />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                              {(commit.authorLogin || commit.authorName || "?")[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {commit.messageHeadline}
                          </p>
                          {/* Show the full commit body (everything after the headline) if present */}
                          {commit.message && commit.message.trim() !== commit.messageHeadline.trim() && (() => {
                            // The body is the message with the headline stripped off.
                            const body = commit.message.slice(commit.messageHeadline.length).trim();
                            if (!body) return null;
                            return (
                              <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1.5 font-mono text-xs text-muted-foreground">
                                {body}
                              </pre>
                            );
                          })()}
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{commit.authorLogin || commit.authorName}</span>
                            <span>&middot;</span>
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                              {commit.oid.slice(0, 7)}
                            </code>
                            <span>&middot;</span>
                            <span>{timeAgo(commit.committedDate)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-xs">
                          {commit.additions > 0 && (
                            <span className="text-green-600 dark:text-green-400">+{commit.additions}</span>
                          )}
                          {commit.deletions > 0 && (
                            <span className="text-red-600 dark:text-red-400">-{commit.deletions}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No commits found.
                </p>
              )}
            </section>
          )}

          {activeTab === "ai-review" && (
            <AIReviewPanel
              reviewing={aiReviewing}
              result={aiResult}
              error={aiError}
              hasLocalPath={hasLocalPath}
              hasTools={!!toolAvailability?.gh && !!toolAvailability?.claude}
              onStart={handleStartAIReview}
              onCancel={handleCancelAIReview}
            />
          )}
        </div>

        {/* Sidebar — sticky so it stays visible while scrolling main content */}
        <div className="sticky top-0 self-start space-y-3">
          {/* Actions */}
          <SidebarSection title="Actions">
            <div className="space-y-2">
              {pr.state === "OPEN" && (
                <DetailApproveButton prNodeId={pr.nodeId} reviews={pr.reviews} author={pr.author} triggerRef={approveRef} onApproved={handleRefresh} />
              )}
              {pr.state === "OPEN" && (
                <DetailRequestChangesButton prNodeId={pr.nodeId} author={pr.author} triggerRef={requestChangesRef} onSubmitted={handleRefresh} />
              )}
              {pr.state === "OPEN" && (
                <DetailMergeButton
                  prNodeId={pr.nodeId}
                  mergeable={pr.mergeable}
                  reviewDecision={pr.reviewDecision}
                  isDraft={pr.isDraft}
                  isInMergeQueue={pr.isInMergeQueue}
                  author={pr.author}
                  onMerged={async () => { await handleRefresh(); navigate(-1); }}
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
              {/* Workspace actions — only available when repo has a local path */}
              {hasLocalPath && (
                <>
                  <button
                    onClick={handleCheckout}
                    disabled={checkingOut || !toolAvailability?.gh}
                    title={
                      !toolAvailability?.gh
                        ? "gh CLI not installed"
                        : checkingOut
                          ? "Checking out..."
                          : currentBranch === pr.headRef
                            ? `Already on ${pr.headRef}`
                            : `Checkout ${pr.headRef}`
                    }
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className={`h-4 w-4 ${checkingOut ? "animate-pulse" : ""}`} />
                    {checkingOut ? "Checking out..." : currentBranch === pr.headRef ? `On ${pr.headRef}` : "Checkout"}
                  </button>
                  <button
                    onClick={handleOpenTerminal}
                    title="Open terminal at repo root"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Terminal className="h-4 w-4" />
                    Open Terminal
                  </button>
                  <button
                    onClick={() => { handleStartAIReview(); setActiveTab("ai-review"); }}
                    disabled={aiReviewing || !toolAvailability?.claude || !toolAvailability?.gh}
                    title={
                      !toolAvailability?.gh
                        ? "gh CLI not installed"
                        : !toolAvailability?.claude
                          ? "Claude CLI not installed"
                          : aiReviewing
                            ? "Review in progress..."
                            : "Start AI code review"
                    }
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-purple-500 bg-transparent px-3 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-purple-300"
                  >
                    <Sparkles className={`h-4 w-4 ${aiReviewing ? "animate-pulse" : ""}`} />
                    {aiReviewing ? "Reviewing..." : "AI Review"}
                    {!aiReviewing && <kbd className="ml-0.5 rounded bg-purple-500/10 px-1 py-0.5 font-mono text-[10px] text-purple-400/60">G</kbd>}
                  </button>
                </>
              )}
            </div>
          </SidebarSection>

          {/* Stats */}
          <SidebarSection title="Stats">
            <div className="grid grid-cols-2 gap-2">
              <StatItem
                icon={<Plus className="h-3.5 w-3.5 text-green-600 dark:text-green-300" />}
                label="Additions"
                value={String(pr.additions)}
              />
              <StatItem
                icon={<Minus className="h-3.5 w-3.5 text-red-600 dark:text-red-300" />}
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
          <ReviewersSidebar reviews={filteredReviews} reviewRequests={pr.reviewRequests} prNodeId={pr.nodeId} isOpen={pr.state === "OPEN"} triggerRef={reviewerToggleRef} onAssigned={handleRefresh} />

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

          {/* Flag Reasons */}
          {flagReasons.length > 0 && (
            <SidebarSection title="Flagged">
              <div className="space-y-1">
                {flagReasons.map((reason, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                    <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">{reason}</code>
                  </div>
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

/** Prominent squash-and-merge button for the detail page sidebar. */
function DetailMergeButton({
  prNodeId,
  mergeable,
  reviewDecision,
  isDraft,
  isInMergeQueue,
  author,
  onMerged,
  triggerRef,
}: {
  prNodeId: string;
  mergeable: string;
  reviewDecision: string;
  isDraft: boolean;
  isInMergeQueue?: boolean;
  author: string;
  onMerged?: () => void;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const { mergePR } = usePRStore();
  const viewerLogin = useAuthStore((s) => s.user?.login);

  // You cannot merge your own PR.
  const isOwnPR = !!viewerLogin && viewerLogin === author;
  const reviewBlocked = reviewDecision === "REVIEW_REQUIRED" || reviewDecision === "CHANGES_REQUESTED";
  const canMerge = !isDraft && !isOwnPR && !reviewBlocked && mergeable === "MERGEABLE";

  // Expose trigger to parent via triggerRef (used by vim "m" key).
  useEffect(() => {
    if (triggerRef) triggerRef.current = () => { if (canMerge) handleMerge(); };
    return () => { if (triggerRef) triggerRef.current = null; };
  });

  const handleMerge = async () => {
    setIsMerging(true);
    setMergeError(null);
    try {
      const result = await mergePR(prNodeId, "SQUASH");
      setMergeResult(result);
      onMerged?.();
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMerging(false);
    }
  };

  // Show enqueued state (persistent from API or ephemeral from merge action)
  if (isInMergeQueue || mergeResult === "enqueued") {
    return (
      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        <CheckCircle className="h-4 w-4" />
        In merge queue
      </div>
    );
  }

  const title = !canMerge
    ? isDraft
      ? "Cannot merge draft PRs"
      : isOwnPR
        ? "Cannot merge your own PR"
        : reviewDecision === "CHANGES_REQUESTED"
          ? "Changes have been requested"
          : reviewDecision === "REVIEW_REQUIRED"
            ? "Review approval is required"
            : mergeable === "CONFLICTING"
              ? "This branch has conflicts"
              : "Cannot merge this PR"
    : "Squash and merge";

  return (
    <div className="relative">
      <button
        onClick={handleMerge}
        disabled={!canMerge || isMerging}
        title={title}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GitMerge className={`h-4 w-4 ${isMerging ? "animate-pulse" : ""}`} />
        Squash and merge
      </button>

      {mergeError && (
        <div className="mt-1 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-destructive shadow-md">
          {mergeError}
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
  onApproved,
}: {
  prNodeId: string;
  reviews: github.Review[] | null;
  author: string;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  onApproved?: () => void;
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
      onApproved?.();
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
      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
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
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-green-600 bg-transparent px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-600/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-green-300"
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

/** Request changes button with a textarea dropdown for the review body. */
function DetailRequestChangesButton({
  prNodeId,
  author,
  triggerRef,
  onSubmitted,
}: {
  prNodeId: string;
  author: string;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  onSubmitted?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { requestChangesPR } = usePRStore();
  const viewerLogin = useAuthStore((s) => s.user?.login);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isOwnPR = !!viewerLogin && viewerLogin === author;

  // Expose toggle to parent via triggerRef.
  useEffect(() => {
    if (triggerRef) triggerRef.current = () => { if (!isOwnPR) setIsOpen((o) => !o); };
    return () => { if (triggerRef) triggerRef.current = null; };
  });

  // Register vim escape override to close dropdown.
  useEffect(() => {
    if (isOpen) {
      useVimStore.setState({ onEscape: () => setIsOpen(false) });
      // Focus the textarea when opened.
      setTimeout(() => textareaRef.current?.focus(), 50);
      return () => useVimStore.setState({ onEscape: null });
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await requestChangesPR(prNodeId, body.trim());
      setBody("");
      setIsOpen(false);
      onSubmitted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const disabled = isOwnPR;
  const title = isOwnPR
    ? "You cannot request changes on your own pull request"
    : "Request changes on this pull request";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={title}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-red-600 bg-transparent px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-600/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
      >
        <XCircle className={`h-4 w-4 ${isSubmitting ? "animate-pulse" : ""}`} />
        Request Changes
        <ChevronDown className="ml-auto h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
          <div className="p-3 space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Describe the changes needed
            </label>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter to submit
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
                // Escape — close the dropdown and stop propagation so tinykeys
                // doesn't also fire its cascade (blur → navigate back).
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(false);
                }
              }}
              placeholder="What needs to change..."
              rows={4}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}+Enter</kbd> to submit
              </span>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !body.trim()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </div>
          {error && (
            <div className="border-t border-border px-3 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
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

function CommentsTab({
  comments,
  loading,
  error,
  toggleSelectedRef,
  resolveRef,
  unresolveRef,
  onToggleResolved,
}: {
  comments: github.PRComments | null;
  loading: boolean;
  error: string | null;
  toggleSelectedRef?: React.MutableRefObject<(() => void) | null>;
  resolveRef?: React.MutableRefObject<(() => void) | null>;
  unresolveRef?: React.MutableRefObject<(() => void) | null>;
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
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
                {/* Thread comments — hidden when collapsed */}
                {!isCollapsed && (
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
        <div className="prose dark:prose-invert prose-sm mt-1.5 max-w-none font-sans text-[14px] prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-thead:border-border prose-tr:border-border">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
            {body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// ---- AI Review Panel ----

function AIReviewPanel({
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

// ---- Helper components ----

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
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
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[state] || "bg-slate-200 text-slate-800 dark:bg-slate-800/70 dark:text-slate-200"}`}
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
  onAssigned,
}: {
  reviews: github.Review[] | null;
  reviewRequests: github.ReviewRequest[] | null;
  prNodeId: string;
  isOpen: boolean;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  onAssigned?: () => void;
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
            onAssigned={onAssigned}
          />
        )}
      </div>
    </SidebarSection>
  );
}


