import { create } from "zustand";
import { github } from "../../wailsjs/go/models";
import {
  GetMyPRsPage,
  GetMyRecentMergedPage,
  GetReviewRequestsPage,
  GetReviewedByMePage,
  GetTeamReviewRequestsPage,
  MergePR,
  RequestReviews,
} from "../../wailsjs/go/services/PullRequestService";

/** Default cache TTL: 5 minutes in milliseconds */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Number of items to fetch from the server per request */
const SERVER_PAGE_SIZE = 25;

type CacheKey = "myPRs" | "myRecentMerged" | "reviewRequests" | "teamReviewRequests" | "reviewedByMe";

interface ServerPageState {
  endCursor: string;
  hasNextPage: boolean;
  totalCount: number;
}

const emptyPageState: ServerPageState = { endCursor: "", hasNextPage: false, totalCount: 0 };

interface PRState {
  myPRs: github.PullRequest[];
  myRecentMerged: github.PullRequest[];
  reviewRequests: github.PullRequest[];
  teamReviewRequests: github.PullRequest[];
  reviewedByMe: github.PullRequest[];

  /** Server-side pagination state per category */
  pageState: Record<CacheKey, ServerPageState>;

  isLoadingMyPRs: boolean;
  isLoadingRecentMerged: boolean;
  isLoadingReviewRequests: boolean;
  isLoadingReviewedByMe: boolean;

  /** Per-category timestamp of last successful fetch */
  lastFetchedAt: Record<CacheKey, number>;
  /** Cache TTL in milliseconds (default 15 min) */
  cacheTTLMs: number;

  error: string | null;

  /** Fetch first page (resets loaded data) */
  fetchMyPRs: (org: string) => Promise<void>;
  fetchMyRecentMerged: (org: string, daysBack?: number) => Promise<void>;
  fetchReviewRequests: (org: string) => Promise<void>;
  fetchTeamReviewRequests: (org: string, team: string) => Promise<void>;
  fetchReviewedByMe: (org: string) => Promise<void>;

  /** Fetch next server page and append results */
  loadMoreMyPRs: (org: string) => Promise<void>;
  loadMoreMyRecentMerged: (org: string, daysBack?: number) => Promise<void>;
  loadMoreReviewRequests: (org: string) => Promise<void>;
  loadMoreReviewedByMe: (org: string) => Promise<void>;

  /** Fetch only if cache is stale for the given category */
  fetchIfStale: (key: CacheKey, fetcher: () => Promise<void>) => Promise<void>;

  /** Force-fetch all categories (serialized for rate limits) */
  fetchAll: (orgs: string[], force?: boolean) => Promise<void>;
  mergePR: (prNodeID: string, method: string) => Promise<void>;
  requestReviews: (prNodeID: string, userIDs: string[], teamIDs: string[]) => Promise<void>;
  setCacheTTL: (ms: number) => void;
  clearError: () => void;
}

function isFresh(lastFetchedAt: number, ttl: number): boolean {
  return Date.now() - lastFetchedAt < ttl;
}

const defaultPageStates: Record<CacheKey, ServerPageState> = {
  myPRs: { ...emptyPageState },
  myRecentMerged: { ...emptyPageState },
  reviewRequests: { ...emptyPageState },
  teamReviewRequests: { ...emptyPageState },
  reviewedByMe: { ...emptyPageState },
};

export const usePRStore = create<PRState>((set, get) => ({
  myPRs: [],
  myRecentMerged: [],
  reviewRequests: [],
  teamReviewRequests: [],
  reviewedByMe: [],
  pageState: { ...defaultPageStates },
  isLoadingMyPRs: false,
  isLoadingRecentMerged: false,
  isLoadingReviewRequests: false,
  isLoadingReviewedByMe: false,
  lastFetchedAt: { myPRs: 0, myRecentMerged: 0, reviewRequests: 0, teamReviewRequests: 0, reviewedByMe: 0 },
  cacheTTLMs: DEFAULT_CACHE_TTL_MS,
  error: null,

  // ---- First-page fetches (reset + load page 1) ----

  fetchMyPRs: async (org: string) => {
    set({ isLoadingMyPRs: true, error: null });
    try {
      const page = await GetMyPRsPage(org, SERVER_PAGE_SIZE, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        myPRs: prs,
        isLoadingMyPRs: false,
        lastFetchedAt: { ...s.lastFetchedAt, myPRs: Date.now() },
        pageState: { ...s.pageState, myPRs: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingMyPRs: false, error: message });
    }
  },

  fetchMyRecentMerged: async (org: string, daysBack = 14) => {
    set({ isLoadingRecentMerged: true, error: null });
    try {
      const page = await GetMyRecentMergedPage(org, daysBack, SERVER_PAGE_SIZE, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        myRecentMerged: prs,
        isLoadingRecentMerged: false,
        lastFetchedAt: { ...s.lastFetchedAt, myRecentMerged: Date.now() },
        pageState: { ...s.pageState, myRecentMerged: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingRecentMerged: false, error: message });
    }
  },

  fetchReviewRequests: async (org: string) => {
    set({ isLoadingReviewRequests: true, error: null });
    try {
      const page = await GetReviewRequestsPage(org, SERVER_PAGE_SIZE, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        reviewRequests: prs,
        isLoadingReviewRequests: false,
        lastFetchedAt: { ...s.lastFetchedAt, reviewRequests: Date.now() },
        pageState: { ...s.pageState, reviewRequests: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewRequests: false, error: message });
    }
  },

  fetchTeamReviewRequests: async (org: string, team: string) => {
    set({ error: null });
    try {
      const page = await GetTeamReviewRequestsPage(org, team, SERVER_PAGE_SIZE, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        teamReviewRequests: prs,
        lastFetchedAt: { ...s.lastFetchedAt, teamReviewRequests: Date.now() },
        pageState: { ...s.pageState, teamReviewRequests: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  fetchReviewedByMe: async (org: string) => {
    set({ isLoadingReviewedByMe: true, error: null });
    try {
      const page = await GetReviewedByMePage(org, SERVER_PAGE_SIZE, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        reviewedByMe: prs,
        isLoadingReviewedByMe: false,
        lastFetchedAt: { ...s.lastFetchedAt, reviewedByMe: Date.now() },
        pageState: { ...s.pageState, reviewedByMe: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewedByMe: false, error: message });
    }
  },

  // ---- Load-more (append next server page) ----

  loadMoreMyPRs: async (org: string) => {
    const { pageState } = get();
    if (!pageState.myPRs.hasNextPage) return;
    set({ isLoadingMyPRs: true, error: null });
    try {
      const page = await GetMyPRsPage(org, SERVER_PAGE_SIZE, pageState.myPRs.endCursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        myPRs: [...s.myPRs, ...prs],
        isLoadingMyPRs: false,
        pageState: { ...s.pageState, myPRs: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingMyPRs: false, error: message });
    }
  },

  loadMoreMyRecentMerged: async (org: string, daysBack = 14) => {
    const { pageState } = get();
    if (!pageState.myRecentMerged.hasNextPage) return;
    set({ isLoadingRecentMerged: true, error: null });
    try {
      const page = await GetMyRecentMergedPage(org, daysBack, SERVER_PAGE_SIZE, pageState.myRecentMerged.endCursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        myRecentMerged: [...s.myRecentMerged, ...prs],
        isLoadingRecentMerged: false,
        pageState: { ...s.pageState, myRecentMerged: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingRecentMerged: false, error: message });
    }
  },

  loadMoreReviewRequests: async (org: string) => {
    const { pageState } = get();
    if (!pageState.reviewRequests.hasNextPage) return;
    set({ isLoadingReviewRequests: true, error: null });
    try {
      const page = await GetReviewRequestsPage(org, SERVER_PAGE_SIZE, pageState.reviewRequests.endCursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        reviewRequests: [...s.reviewRequests, ...prs],
        isLoadingReviewRequests: false,
        pageState: { ...s.pageState, reviewRequests: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewRequests: false, error: message });
    }
  },

  loadMoreReviewedByMe: async (org: string) => {
    const { pageState } = get();
    if (!pageState.reviewedByMe.hasNextPage) return;
    set({ isLoadingReviewedByMe: true, error: null });
    try {
      const page = await GetReviewedByMePage(org, SERVER_PAGE_SIZE, pageState.reviewedByMe.endCursor);
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      set((s) => ({
        reviewedByMe: [...s.reviewedByMe, ...prs],
        isLoadingReviewedByMe: false,
        pageState: { ...s.pageState, reviewedByMe: { endCursor: info.endCursor, hasNextPage: info.hasNextPage, totalCount: info.totalCount } },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewedByMe: false, error: message });
    }
  },

  // ---- Shared ----

  fetchIfStale: async (key: CacheKey, fetcher: () => Promise<void>) => {
    const { lastFetchedAt, cacheTTLMs } = get();
    if (isFresh(lastFetchedAt[key], cacheTTLMs)) return;
    await fetcher();
  },

  fetchAll: async (orgs: string[], force = false) => {
    const state = get();
    state.clearError();
    for (const org of orgs) {
      if (force || !isFresh(state.lastFetchedAt.myPRs, state.cacheTTLMs)) {
        await state.fetchMyPRs(org);
      }
      if (force || !isFresh(state.lastFetchedAt.reviewRequests, state.cacheTTLMs)) {
        await state.fetchReviewRequests(org);
      }
      if (force || !isFresh(state.lastFetchedAt.reviewedByMe, state.cacheTTLMs)) {
        await state.fetchReviewedByMe(org);
      }
      if (force || !isFresh(state.lastFetchedAt.myRecentMerged, state.cacheTTLMs)) {
        await state.fetchMyRecentMerged(org);
      }
    }
  },

  mergePR: async (prNodeID: string, method: string) => {
    try {
      await MergePR(prNodeID, method);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  requestReviews: async (prNodeID: string, userIDs: string[], teamIDs: string[]) => {
    try {
      await RequestReviews(prNodeID, userIDs, teamIDs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  setCacheTTL: (ms: number) => set({ cacheTTLMs: ms }),
  clearError: () => set({ error: null }),
}));
