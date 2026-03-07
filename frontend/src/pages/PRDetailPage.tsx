import { useMemo, useState, useEffect, useRef, useCallback } from "react";
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
  Tag,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  MessageSquare,
  FileText,
  Activity,
  Terminal,
  Download,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { BrowserOpenURL, EventsOn } from "../../wailsjs/runtime/runtime";
import { GetPRCheckRuns, GetPRComments, GetPRCommits, GetPRFiles, GetSinglePR, GetSinglePRByNodeID, ResolveThread, UnresolveThread } from "../../wailsjs/go/services/PullRequestService";
import { CheckToolAvailability, CheckoutPR, OpenTerminal as OpenTerminalInRepo, StartAIReview, CancelAIReview, GetCurrentBranch, GetAIReview, DeleteAIReview, StartGenerateDescription, CancelGenerateDescription, ApplyPRDescription, StartGenerateTitle, CancelGenerateTitle, ApplyPRTitle } from "../../wailsjs/go/services/WorkspaceService";
import { copyToClipboard, formatSinglePR } from "../lib/clipboard";
import { mdComponents } from "@/lib/markdownComponents";

import { useVimStore, registerActions, clearActions } from "@/stores/vimStore";
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
import { LabelAssign } from "@/components/pr/LabelAssign";
import { DiffView } from "@/components/pr/DiffView";
import { useFindPR } from "@/hooks/useFindPR";
import { ChecksTab } from "@/components/pr/detail/ChecksTab";
import { CommentsTab } from "@/components/pr/detail/CommentsTab";
import { AIReviewPanel } from "@/components/pr/detail/AIReviewPanel";
import { ReviewersSidebar } from "@/components/pr/detail/ReviewersSidebar";
import { SidebarSection, StatItem, TimestampRow } from "@/components/pr/detail/SidebarSection";
import { ReviewStateBadge } from "@/components/pr/ReviewStateBadge";
import { LabelBadge } from "@/components/pr/LabelBadge";
import { DetailMergeButton } from "@/components/pr/detail/DetailMergeButton";
import { DetailApproveButton } from "@/components/pr/detail/DetailApproveButton";
import { DetailRequestChangesButton } from "@/components/pr/detail/DetailRequestChangesButton";
import { DetailReadyForReviewButton } from "@/components/pr/detail/DetailReadyForReviewButton";

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

  // Reactive vim selectedIndex — only needed for commit list rendering.
  // Subscribe via a narrow selector so changes only trigger a re-render
  // when we're on the commits tab and the value actually changes.
  const vimSelectedIndex = useVimStore((s) =>
    activeTab === "commits" ? s.selectedIndex : -1,
  );
  const commitListRef = useRef<HTMLUListElement>(null);

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

  // Vim-navigable action index for AI-generated title/description buttons.
  // -1 = no action focused; 0+ indexes into the flat list of visible action buttons.
  const [focusedAction, setFocusedAction] = useState(-1);

  // Reset focused action when tab changes or generated content disappears.
  useEffect(() => { setFocusedAction(-1); }, [activeTab, generatedTitle, generatedDesc]);

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
  const labelToggleRef = useRef<(() => void) | null>(null);
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

  // Fetch files when the files tab is first selected.
  // Use primitive deps (owner/repo/number) instead of the `pr` object to
  // avoid re-firing when the object reference changes but the data is identical.
  const prOwner = pr?.repoOwner;
  const prRepo = pr?.repoName;
  const prNumber = pr?.number;
  useEffect(() => {
    if (activeTab !== "files" || prFiles !== null || filesLoading || !prOwner || !prRepo || !prNumber) return;
    setFilesLoading(true);
    GetPRFiles(prOwner, prRepo, prNumber)
      .then(setPRFiles)
      .catch((err) => setFilesError(String(err)))
      .finally(() => setFilesLoading(false));
  }, [activeTab, prFiles, filesLoading, prOwner, prRepo, prNumber]);

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
  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    // If we already know owner/repo/number (from a previous fetch or store),
    // use the fast path. Otherwise fall back to fetching by node ID.
    const info = prRef.current;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshError(null);
    try {
      let fresh: github.PullRequest;
      if (info) {
        fresh = await GetSinglePR(info.owner, info.repo, info.number);
      } else if (nodeId) {
        fresh = await GetSinglePRByNodeID(nodeId);
      } else {
        return;
      }
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
  }, [nodeId]);

  // Auto-fetch fresh PR data on mount. Always fetch — the store copy may be
  // stale, or the PR may not be in the store at all (e.g. in "All Repos" mode
  // after a repo switch that cleared the store).
  useEffect(() => {
    if (!fetchedPR) {
      handleRefresh();
    }
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const vs = useVimStore.getState();
    if (vs.selectedIndex !== -1) vs.setSelectedIndex(-1);
  }, [activeTab]);

  // Update list length based on active tab and loaded data.
  useEffect(() => {
    const vs = useVimStore.getState();
    let len = 0;
    let idx: number | undefined;
    if (activeTab === "checks") {
      len = checkRuns?.length ?? 0;
    } else if (activeTab === "comments") {
      const ic = comments?.issueComments?.length ?? 0;
      const rt = comments?.reviewThreads?.length ?? 0;
      len = ic + rt;
    } else if (activeTab === "files") {
      len = prFiles?.length ?? 0;
    } else if (activeTab === "commits") {
      len = commits?.length ?? 0;
    } else if (activeTab === "ai-review" || activeTab === "description") {
      // Length 1 + selectedIndex 0 so Enter fires immediately without needing j first.
      len = 1;
      idx = 0;
    }
    if (vs.listLength !== len) vs.setListLength(len);
    if (idx !== undefined && vs.selectedIndex !== idx) vs.setSelectedIndex(idx);
  }, [activeTab, checkRuns, comments, commits, prFiles]);

  // Auto-scroll the selected commit into view.
  useEffect(() => {
    if (activeTab !== "commits" || vimSelectedIndex < 0 || !commitListRef.current) return;
    const item = commitListRef.current.querySelector(`[data-idx="${vimSelectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeTab, vimSelectedIndex]);

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
      onAssignLabel: () => labelToggleRef.current?.(),
      onMerge: () => mergeToggleRef.current?.(),
      onApprove: () => approveRef.current?.(),
      onRequestChanges: () => requestChangesRef.current?.(),
      onCopy: async () => {
        if (!pr) return;
        const ok = await copyToClipboard(formatSinglePR(pr));
        if (ok) addToast("Copied PR to clipboard", "success");
      },
    };

    if (activeTab === "description") {
      actions.onOpenExternal = () => { if (pr) BrowserOpenURL(pr.url); };
      if (hasLocalPath && toolAvailability?.gh && toolAvailability?.claude) {
        actions.onGenerate = () => { if (!descGenerating) handleGenerateDescription(); };
        actions.onGenerateTitle = () => { if (!titleGenerating) handleGenerateTitle(); };
      }

      // Build a flat list of actionable buttons for generated title/description.
      const aiActions: { label: string; handler: () => void }[] = [];
      if (generatedTitle && !titleGenerating) {
        aiActions.push({ label: "Regenerate title", handler: handleGenerateTitle });
        aiActions.push({ label: "Discard title", handler: () => setGeneratedTitle(null) });
        aiActions.push({ label: "Apply title", handler: handleApplyTitle });
      }
      if (generatedDesc && !descGenerating) {
        aiActions.push({ label: "Regenerate description", handler: handleGenerateDescription });
        aiActions.push({ label: "Discard description", handler: () => setGeneratedDesc(null) });
        aiActions.push({ label: "Apply description", handler: handleApplyDescription });
      }

      if (aiActions.length > 0) {
        // j/k cycle through action buttons; Enter activates the focused one.
        actions.onMoveDown = () => setFocusedAction((prev) => Math.min(prev + 1, aiActions.length - 1));
        actions.onMoveUp = () => setFocusedAction((prev) => Math.max(prev - 1, -1));
        actions.onOpen = () => {
          if (focusedAction >= 0 && focusedAction < aiActions.length) {
            aiActions[focusedAction].handler();
            setFocusedAction(-1);
          }
        };
      } else {
        // No generated content — default scroll + generate behavior.
        const scrollEl = document.getElementById("scroll-region");
        actions.onMoveDown = () => scrollEl?.scrollBy(0, 150);
        actions.onMoveUp = () => scrollEl?.scrollBy(0, -150);
        if (hasLocalPath && toolAvailability?.gh && toolAvailability?.claude) {
          actions.onOpen = () => { if (!descGenerating) handleGenerateDescription(); };
        }
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
      actions.onGenerateReview = () => { if (!aiReviewing) handleStartAIReview(); };
    }

    registerActions(actions);
    return () => clearActions();
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
                          <kbd className="ml-0.5 rounded bg-purple-500/10 px-1 py-0.5 font-mono text-[10px] text-purple-400/60">D</kbd>
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
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground ${
                            focusedAction === 0
                              ? "ring-2 ring-primary border-primary text-foreground"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                        <button
                          onClick={() => { setGeneratedTitle(null); setFocusedAction(-1); }}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground ${
                            focusedAction === 1
                              ? "ring-2 ring-primary border-primary text-foreground"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <XCircle className="h-3 w-3" />
                          Discard
                        </button>
                        <button
                          onClick={handleApplyTitle}
                          disabled={applyingTitle}
                          className={`inline-flex items-center gap-1 rounded-md border border-green-600 bg-green-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 ${
                            focusedAction === 2 ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
                          }`}
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
                {generatedDesc && !descGenerating && (() => {
                  // Offset for desc action indices: 3 if title is also visible, else 0.
                  const dOff = (generatedTitle && !titleGenerating) ? 3 : 0;
                  return (
                  <div className="space-y-2 rounded-lg border-2 border-purple-500/40 bg-purple-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                        AI-Generated Preview
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleGenerateDescription}
                          title="Regenerate description"
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground ${
                            focusedAction === dOff
                              ? "ring-2 ring-primary border-primary text-foreground"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                        <button
                          onClick={() => { setGeneratedDesc(null); setFocusedAction(-1); }}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground ${
                            focusedAction === dOff + 1
                              ? "ring-2 ring-primary border-primary text-foreground"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <XCircle className="h-3 w-3" />
                          Discard
                        </button>
                        <button
                          onClick={handleApplyDescription}
                          disabled={applyingDesc}
                          className={`inline-flex items-center gap-1 rounded-md border border-green-600 bg-green-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 ${
                            focusedAction === dOff + 2 ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
                          }`}
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
                  );
                })()}

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
                <ul ref={commitListRef} className="space-y-1">
                  {commits.map((commit, idx) => {
                    const selected = vimSelectedIndex === idx;
                    return (
                      <li
                        key={commit.oid}
                        data-idx={idx}
                        onClick={() => {
                          if (pr) BrowserOpenURL(`${pr.url}/commits/${commit.oid}`);
                        }}
                        className={`group flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors ${
                          selected
                            ? "ring-1 ring-primary border-primary/50"
                            : "border-border hover:border-primary/50"
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
              {pr.state === "OPEN" && pr.isDraft && (
                <DetailReadyForReviewButton prNodeId={pr.nodeId} onReady={handleRefresh} />
              )}
              {pr.state === "OPEN" && (
                <DetailMergeButton
                  prNodeId={pr.nodeId}
                  mergeable={pr.mergeable}
                  reviewDecision={pr.reviewDecision}
                  isDraft={pr.isDraft}
                  isInMergeQueue={pr.isInMergeQueue}
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
                    {!aiReviewing && <kbd className="ml-0.5 rounded bg-purple-500/10 px-1 py-0.5 font-mono text-[10px] text-purple-400/60">E</kbd>}
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
          <div className="rounded-lg border border-border bg-card p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Labels</h4>
              <LabelAssign
                prNodeId={pr.nodeId}
                currentLabels={pr.labels || []}
                repoOwner={pr.repoOwner}
                repoName={pr.repoName}
                onChanged={handleRefresh}
                triggerRef={labelToggleRef}
              />
            </div>
            {pr.labels && pr.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {pr.labels.map((label) => (
                  <LabelBadge key={label.name} label={label} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No labels</p>
            )}
          </div>

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

