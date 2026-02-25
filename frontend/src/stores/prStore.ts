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

  error: string | null;

  fetchMyPRs: (org: string) => Promise<void>;
  fetchMyRecentMerged: (org: string, daysBack?: number) => Promise<void>;
  fetchReviewRequests: (org: string) => Promise<void>;
  fetchTeamReviewRequests: (org: string, team: string) => Promise<void>;
  fetchReviewedByMe: (org: string) => Promise<void>;
  fetchAll: (orgs: string[]) => Promise<void>;
  mergePR: (prNodeID: string, method: string) => Promise<void>;
  requestReviews: (prNodeID: string, userIDs: string[], teamIDs: string[]) => Promise<void>;
  clearError: () => void;
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
  error: null,

  fetchMyPRs: async (org: string) => {
    set({ isLoadingMyPRs: true, error: null });
    try {
      const prs = await GetMyPRs(org);
      set({ myPRs: prs || [], isLoadingMyPRs: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingMyPRs: false, error: message });
    }
  },

  fetchMyRecentMerged: async (org: string, daysBack = 14) => {
    set({ isLoadingRecentMerged: true, error: null });
    try {
      const prs = await GetMyRecentMerged(org, daysBack);
      set({ myRecentMerged: prs || [], isLoadingRecentMerged: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingRecentMerged: false, error: message });
    }
  },

  fetchReviewRequests: async (org: string) => {
    set({ isLoadingReviewRequests: true, error: null });
    try {
      const prs = await GetReviewRequests(org);
      set({ reviewRequests: prs || [], isLoadingReviewRequests: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewRequests: false, error: message });
    }
  },

  fetchTeamReviewRequests: async (org: string, team: string) => {
    set({ error: null });
    try {
      const prs = await GetTeamReviewRequests(org, team);
      set({ teamReviewRequests: prs || [] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  fetchReviewedByMe: async (org: string) => {
    set({ isLoadingReviewedByMe: true, error: null });
    try {
      const prs = await GetReviewedByMe(org);
      set({ reviewedByMe: prs || [], isLoadingReviewedByMe: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoadingReviewedByMe: false, error: message });
    }
  },

  fetchAll: async (orgs: string[]) => {
    const state = get();
    state.clearError();
    // Serialize requests to avoid GitHub secondary rate limits.
    for (const org of orgs) {
      await state.fetchMyPRs(org);
      await state.fetchReviewRequests(org);
      await state.fetchReviewedByMe(org);
      await state.fetchMyRecentMerged(org);
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

  clearError: () => set({ error: null }),
}));
