import { create } from "zustand";
import { github } from "../../wailsjs/go/models";
import {
  GetMyPRs,
  GetMyRecentMerged,
  GetReviewRequests,
  GetReviewedByMe,
  GetTeamReviewRequests,
  MergePR,
  RequestReviews,
} from "../../wailsjs/go/services/PullRequestService";

/** Default cache TTL: 15 minutes in milliseconds */
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

type CacheKey = "myPRs" | "myRecentMerged" | "reviewRequests" | "teamReviewRequests" | "reviewedByMe";

interface PRState {
  myPRs: github.PullRequest[];
  myRecentMerged: github.PullRequest[];
  reviewRequests: github.PullRequest[];
  teamReviewRequests: github.PullRequest[];
  reviewedByMe: github.PullRequest[];

  isLoadingMyPRs: boolean;
  isLoadingRecentMerged: boolean;
  isLoadingReviewRequests: boolean;
  isLoadingReviewedByMe: boolean;

  /** Per-category timestamp of last successful fetch */
  lastFetchedAt: Record<CacheKey, number>;
  /** Cache TTL in milliseconds (default 15 min) */
  cacheTTLMs: number;

  error: string | null;

  /** Force-fetch (ignores cache) */
  fetchMyPRs: (org: string) => Promise<void>;
  fetchMyRecentMerged: (org: string, daysBack?: number) => Promise<void>;
  fetchReviewRequests: (org: string) => Promise<void>;
  fetchTeamReviewRequests: (org: string, team: string) => Promise<void>;
  fetchReviewedByMe: (org: string) => Promise<void>;

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

export const usePRStore = create<PRState>((set, get) => ({
  myPRs: [],
  myRecentMerged: [],
  reviewRequests: [],
  teamReviewRequests: [],
  reviewedByMe: [],
  isLoadingMyPRs: false,
  isLoadingRecentMerged: false,
  isLoadingReviewRequests: false,
  isLoadingReviewedByMe: false,
  lastFetchedAt: { myPRs: 0, myRecentMerged: 0, reviewRequests: 0, teamReviewRequests: 0, reviewedByMe: 0 },
  cacheTTLMs: DEFAULT_CACHE_TTL_MS,
  error: null,

  fetchMyPRs: async (org: string) => {
    set({ isLoadingMyPRs: true, error: null });
    try {
      const prs = await GetMyPRs(org);
      set((s) => ({
        myPRs: prs || [],
        isLoadingMyPRs: false,
        lastFetchedAt: { ...s.lastFetchedAt, myPRs: Date.now() },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingMyPRs: false, error: message });
    }
  },

  fetchMyRecentMerged: async (org: string, daysBack = 14) => {
    set({ isLoadingRecentMerged: true, error: null });
    try {
      const prs = await GetMyRecentMerged(org, daysBack);
      set((s) => ({
        myRecentMerged: prs || [],
        isLoadingRecentMerged: false,
        lastFetchedAt: { ...s.lastFetchedAt, myRecentMerged: Date.now() },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingRecentMerged: false, error: message });
    }
  },

  fetchReviewRequests: async (org: string) => {
    set({ isLoadingReviewRequests: true, error: null });
    try {
      const prs = await GetReviewRequests(org);
      set((s) => ({
        reviewRequests: prs || [],
        isLoadingReviewRequests: false,
        lastFetchedAt: { ...s.lastFetchedAt, reviewRequests: Date.now() },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewRequests: false, error: message });
    }
  },

  fetchTeamReviewRequests: async (org: string, team: string) => {
    set({ error: null });
    try {
      const prs = await GetTeamReviewRequests(org, team);
      set((s) => ({
        teamReviewRequests: prs || [],
        lastFetchedAt: { ...s.lastFetchedAt, teamReviewRequests: Date.now() },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  fetchReviewedByMe: async (org: string) => {
    set({ isLoadingReviewedByMe: true, error: null });
    try {
      const prs = await GetReviewedByMe(org);
      set((s) => ({
        reviewedByMe: prs || [],
        isLoadingReviewedByMe: false,
        lastFetchedAt: { ...s.lastFetchedAt, reviewedByMe: Date.now() },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewedByMe: false, error: message });
    }
  },

  fetchIfStale: async (key: CacheKey, fetcher: () => Promise<void>) => {
    const { lastFetchedAt, cacheTTLMs } = get();
    if (isFresh(lastFetchedAt[key], cacheTTLMs)) return;
    await fetcher();
  },

  fetchAll: async (orgs: string[], force = false) => {
    const state = get();
    state.clearError();
    // Serialize requests to avoid GitHub secondary rate limits.
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
