import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitPullRequest,
  Eye,
  CheckCircle,
  GitMerge,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Clock,
} from "lucide-react";
import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVimStore, registerActions, clearActions } from "@/stores/vimStore";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { timeAgo } from "@/lib/utils";
import { StateBadge } from "@/components/pr/StateBadge";
import { PRSizeBadge } from "@/components/pr/PRSizeBadge";
import { ChecksStatusIcon } from "@/components/pr/ChecksStatusIcon";
import { LastRefreshed } from "@/components/ui/LastRefreshed";
import { github } from "../../wailsjs/go/models";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  sublabel?: string;
}

function StatCard({ label, value, icon, href, sublabel }: StatCardProps) {
  const navigate = useNavigate();
  const handleClick = href ? () => navigate(href) : undefined;

  return (
    <div
      onClick={handleClick}
      className={`rounded-lg border border-border bg-card p-3 ${
        href ? "cursor-pointer transition-colors hover:bg-accent/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="mt-2">
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {label}
        </p>
        {sublabel && (
          <p className="text-xs text-muted-foreground/70">{sublabel}</p>
        )}
      </div>
    </div>
  );
}

interface PRRowProps {
  pr: github.PullRequest;
  showAuthor?: boolean;
  isSelected?: boolean;
}

function PRRow({ pr, showAuthor, isSelected }: PRRowProps) {
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  return (
    <div
      ref={rowRef}
      onClick={() => navigate(`/pr/${pr.nodeId}`)}
      className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 transition-colors ${
        isSelected ? "bg-accent/60" : "hover:bg-muted/30"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {pr.repoOwner}/{pr.repoName}#{pr.number}
          </span>
          <StateBadge state={pr.state} isDraft={pr.isDraft} isInMergeQueue={pr.isInMergeQueue} />
          <ChecksStatusIcon status={pr.checksStatus} isMerged={pr.state === "MERGED"} />
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {pr.title}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {showAuthor && pr.author && (
            <span className="flex items-center gap-1">
              {pr.authorAvatar && (
                <img
                  src={pr.authorAvatar}
                  className="h-3 w-3 rounded-full"
                  alt=""
                />
              )}
              {pr.author}
            </span>
          )}
          <PRSizeBadge additions={pr.additions} deletions={pr.deletions} />
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(pr.updatedAt)}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); BrowserOpenURL(pr.url); }}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        title="Open in GitHub"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface PRListSectionProps {
  title: string;
  icon: React.ReactNode;
  prs: github.PullRequest[];
  isLoading: boolean;
  emptyMessage: string;
  showAuthor?: boolean;
  href?: string;
  maxItems?: number;
  sectionIndex?: number;
  isFocused?: boolean;
  selectedRowIndex?: number;
}

function PRListSection({
  title,
  icon,
  prs,
  isLoading,
  emptyMessage,
  showAuthor,
  href,
  maxItems = 5,
  sectionIndex,
  isFocused,
  selectedRowIndex,
}: PRListSectionProps) {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLDivElement>(null);
  const displayPrs = prs.slice(0, maxItems);
  const remaining = prs.length - maxItems;

  useEffect(() => {
    if (isFocused && sectionRef.current) {
      sectionRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isFocused]);

  return (
    <div
      ref={sectionRef}
      className={`rounded-lg border bg-card transition-colors ${
        isFocused ? "border-primary ring-1 ring-primary/40" : "border-border"
      }`}
    >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {prs.length > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {prs.length}
            </span>
          )}
          {sectionIndex != null && (
            <kbd className="ml-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">
              {sectionIndex + 1}
            </kbd>
          )}
        </div>
        {href && (
          <button
            onClick={() => navigate(href)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
          </button>
        )}
      </div>
      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : displayPrs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <>
            {displayPrs.map((pr, idx) => (
              <PRRow
                key={pr.nodeId}
                pr={pr}
                showAuthor={showAuthor}
                isSelected={isFocused && selectedRowIndex === idx}
              />
            ))}
            {remaining > 0 && href && (
              <div className="px-4 py-2 text-center">
                <button
                  onClick={() => navigate(href)}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  +{remaining} more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { isAuthenticated } = useAuthStore();
  const { orgs, loadOrgs } = useSettingsStore();
  const {
    pages,
    isLoading: loadingFlags,
    lastFetchedAt,
    fetchAll,
    error,
    clearError,
  } = usePRStore();

  const navigate = useNavigate();

  const myPRs = pages.myPRs.items;
  const myRecentMerged = pages.myRecentMerged.items;
  const reviewRequests = pages.reviewRequests.items;
  const reviewedByMe = pages.reviewedByMe.items;

  const isLoading =
    loadingFlags.myPRs ||
    loadingFlags.myRecentMerged ||
    loadingFlags.reviewRequests ||
    loadingFlags.reviewedByMe;

  const forceRefresh = useCallback(() => {
    clearError();
    fetchAll(orgs, true);
  }, [orgs, fetchAll, clearError]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (isAuthenticated && orgs.length > 0) {
      fetchAll(orgs); // uses cache — skips categories that are still fresh
    }
  }, [isAuthenticated, orgs, fetchAll]);

  // ---- Section focus / vim navigation ----
  const [focusedSection, setFocusedSection] = useState<number>(-1);
  const selectedIndex = useVimStore((s) => s.selectedIndex);

  // Compute stats
  const needsAttention = useMemo(
    () => reviewRequests.filter((pr) => pr.reviewDecision !== "APPROVED"),
    [reviewRequests],
  );
  const myPRsNeedingWork = useMemo(
    () => myPRs.filter((pr) => pr.reviewDecision === "CHANGES_REQUESTED" || pr.checksStatus === "FAILURE"),
    [myPRs],
  );

  // The 4 section PR lists (capped to maxItems=5 to match display)
  const sectionPRs = useMemo(() => [
    needsAttention.slice(0, 5),
    myPRsNeedingWork.slice(0, 5),
    myPRs.slice(0, 5),
    myRecentMerged.slice(0, 5),
  ], [needsAttention, myPRsNeedingWork, myPRs, myRecentMerged]);

  // When focused section changes, update vimStore listLength for j/k navigation
  useEffect(() => {
    if (focusedSection >= 0 && focusedSection < sectionPRs.length) {
      useVimStore.getState().setListLength(sectionPRs[focusedSection].length);
      useVimStore.getState().setSelectedIndex(-1);
    } else {
      useVimStore.getState().setListLength(0);
      useVimStore.getState().setSelectedIndex(-1);
    }
  }, [focusedSection, sectionPRs]);

  // Register vim actions
  useEffect(() => {
    const getPRForIndex = (idx: number): github.PullRequest | undefined => {
      if (focusedSection < 0) return undefined;
      return sectionPRs[focusedSection]?.[idx];
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actions: any = {
      onRefresh: forceRefresh,
      onTabDirect: (idx: number) => {
        if (idx >= 0 && idx < 4) {
          setFocusedSection((prev) => prev === idx ? -1 : idx);
        }
      },
      onOpen: (idx: number) => {
        const pr = getPRForIndex(idx);
        if (pr) navigate(`/pr/${pr.nodeId}`);
      },
      onOpenExternal: (idx: number) => {
        const pr = getPRForIndex(idx);
        if (pr) BrowserOpenURL(pr.url);
      },
      onEscape: () => {
        if (focusedSection >= 0) {
          setFocusedSection(-1);
        }
      },
    };

    // When no section is focused, j/k scroll the page
    if (focusedSection < 0) {
      const scrollEl = document.getElementById("scroll-region");
      actions.onMoveDown = () => scrollEl?.scrollBy({ top: 150, behavior: "smooth" });
      actions.onMoveUp = () => scrollEl?.scrollBy({ top: -150, behavior: "smooth" });
    }

    registerActions(actions);
    return () => clearActions();
  }); // no deps — re-registers each render with fresh closures

  if (!isAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Connect your GitHub account in Settings to see your dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Add a GitHub organization in Settings to start tracking pull
            requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview of your pull request activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LastRefreshed timestamp={Math.min(
            lastFetchedAt.myPRs || Infinity,
            lastFetchedAt.reviewRequests || Infinity,
            lastFetchedAt.reviewedByMe || Infinity,
          )} />
          <button
            onClick={forceRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Open PRs"
          value={pages.myPRs.totalCount || myPRs.length}
          icon={<GitPullRequest className="h-5 w-5" />}
          href="/my-prs"
          sublabel="Authored by you"
        />
        <StatCard
          label="Review Requests"
          value={pages.reviewRequests.totalCount || reviewRequests.length}
          icon={<Eye className="h-5 w-5" />}
          href="/review-requests"
          sublabel="Waiting for your review"
        />
        <StatCard
          label="Reviewed"
          value={pages.reviewedByMe.totalCount || reviewedByMe.length}
          icon={<CheckCircle className="h-5 w-5" />}
          href="/reviewed"
          sublabel="Open PRs you reviewed"
        />
        <StatCard
          label="Recently Merged"
          value={pages.myRecentMerged.totalCount || myRecentMerged.length}
          icon={<GitMerge className="h-5 w-5" />}
          sublabel="Last 14 days"
        />
      </div>

      {/* PR lists */}
      <div className="grid grid-cols-2 gap-4">
        {/* Needs your attention - review requests that aren't approved yet */}
        <PRListSection
          title="Needs Your Review"
          icon={<Eye className="h-4 w-4 text-yellow-500" />}
          prs={needsAttention}
          isLoading={loadingFlags.reviewRequests}
          emptyMessage="No pending reviews. You're all caught up!"
          showAuthor
          href="/review-requests"
          sectionIndex={0}
          isFocused={focusedSection === 0}
          selectedRowIndex={focusedSection === 0 ? selectedIndex : -1}
        />

        {/* Your PRs that need work */}
        <PRListSection
          title="Your PRs Needing Work"
          icon={<AlertCircle className="h-4 w-4 text-orange-500" />}
          prs={myPRsNeedingWork}
          isLoading={loadingFlags.myPRs}
          emptyMessage="All your PRs are looking good!"
          href="/my-prs"
          sectionIndex={1}
          isFocused={focusedSection === 1}
          selectedRowIndex={focusedSection === 1 ? selectedIndex : -1}
        />

        {/* Your open PRs */}
        <PRListSection
          title="Your Open PRs"
          icon={<GitPullRequest className="h-4 w-4 text-green-500" />}
          prs={myPRs}
          isLoading={loadingFlags.myPRs}
          emptyMessage="No open pull requests."
          href="/my-prs"
          sectionIndex={2}
          isFocused={focusedSection === 2}
          selectedRowIndex={focusedSection === 2 ? selectedIndex : -1}
        />

        {/* Recently merged */}
        <PRListSection
          title="Recently Merged"
          icon={<GitMerge className="h-4 w-4 text-purple-500" />}
          prs={myRecentMerged}
          isLoading={loadingFlags.myRecentMerged}
          emptyMessage="No recently merged PRs."
          sectionIndex={3}
          isFocused={focusedSection === 3}
          selectedRowIndex={focusedSection === 3 ? selectedIndex : -1}
        />
      </div>
    </div>
  );
}
