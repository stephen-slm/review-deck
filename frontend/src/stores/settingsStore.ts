import { create } from "zustand";
import {
  GetTrackedOrgs,
  AddTrackedOrg,
  RemoveTrackedOrg,
  GetSetting,
  SetSetting,
  GetTrackedTeams,
  SetTeamEnabled,
  GetReviewPriorities,
  AddReviewPriority,
  RemoveReviewPriority,
  UpdateReviewPriorityOrder,
  GetExcludedRepos,
  AddExcludedRepo,
  RemoveExcludedRepo,
} from "../../wailsjs/go/services/SettingsService";
import { SyncTeamsForOrg } from "../../wailsjs/go/services/PullRequestService";
import { SetPollInterval } from "../../wailsjs/go/main/App";
import { storage } from "../../wailsjs/go/models";
import { usePRStore } from "./prStore";

const DEFAULT_CACHE_TTL_MINUTES = 5;
const DEFAULT_POLL_INTERVAL_MINUTES = 5;

interface SettingsState {
  orgs: string[];
  filterBots: boolean;
  hideStackedPRs: boolean;
  hideCopilotReviews: boolean;
  cacheTTLMinutes: number;
  pollIntervalMinutes: number;
  /** Tracked teams keyed by org name */
  teamsByOrg: Record<string, storage.TrackedTeam[]>;
  /** Review priorities keyed by org name */
  prioritiesByOrg: Record<string, storage.ReviewPriority[]>;
  isLoading: boolean;

  loadOrgs: () => Promise<void>;
  addOrg: (org: string) => Promise<void>;
  removeOrg: (org: string) => Promise<void>;
  loadFilterBots: () => Promise<void>;
  setFilterBots: (enabled: boolean) => Promise<void>;
  loadHideStackedPRs: () => Promise<void>;
  setHideStackedPRs: (enabled: boolean) => Promise<void>;
  loadHideCopilotReviews: () => Promise<void>;
  setHideCopilotReviews: (enabled: boolean) => Promise<void>;
  loadCacheTTL: () => Promise<void>;
  setCacheTTL: (minutes: number) => Promise<void>;
  loadPollInterval: () => Promise<void>;
  setPollInterval: (minutes: number) => Promise<void>;
  loadTeams: (org: string) => Promise<void>;
  loadAllTeams: () => Promise<void>;
  syncTeams: (org: string) => Promise<void>;
  setTeamEnabled: (org: string, slug: string, enabled: boolean) => Promise<void>;
  loadPriorities: (org: string) => Promise<void>;
  loadAllPriorities: () => Promise<void>;
  addPriority: (org: string, name: string, type: string) => Promise<void>;
  removePriority: (org: string, name: string, type: string) => Promise<void>;
  movePriority: (org: string, name: string, type: string, direction: "up" | "down") => Promise<void>;
  /** Returns a Set of priority names (users + teams) across all orgs for quick lookup. */
  getPriorityNames: () => Set<string>;
  /** Excluded repos keyed by org name */
  excludedReposByOrg: Record<string, string[]>;
  loadExcludedRepos: (org: string) => Promise<void>;
  loadAllExcludedRepos: () => Promise<void>;
  addExcludedRepo: (org: string, repo: string) => Promise<void>;
  removeExcludedRepo: (org: string, repo: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  orgs: [],
  filterBots: false,
  hideStackedPRs: false,
  hideCopilotReviews: false,
  cacheTTLMinutes: DEFAULT_CACHE_TTL_MINUTES,
  pollIntervalMinutes: DEFAULT_POLL_INTERVAL_MINUTES,
  teamsByOrg: {},
  prioritiesByOrg: {},
  excludedReposByOrg: {},
  isLoading: false,

  loadOrgs: async () => {
    set({ isLoading: true });
    try {
      const orgs = await GetTrackedOrgs();
      set({ orgs: orgs || [], isLoading: false });
    } catch {
      set({ orgs: [], isLoading: false });
    }
  },

  addOrg: async (org: string) => {
    await AddTrackedOrg(org);
    await get().loadOrgs();
  },

  removeOrg: async (org: string) => {
    await RemoveTrackedOrg(org);
    await get().loadOrgs();
  },

  loadFilterBots: async () => {
    try {
      const val = await GetSetting("filter_bots");
      set({ filterBots: val === "true" });
    } catch {
      set({ filterBots: false });
    }
  },

  setFilterBots: async (enabled: boolean) => {
    await SetSetting("filter_bots", enabled ? "true" : "false");
    set({ filterBots: enabled });
  },

  loadHideStackedPRs: async () => {
    try {
      const val = await GetSetting("hide_stacked_prs");
      set({ hideStackedPRs: val === "true" });
    } catch {
      set({ hideStackedPRs: false });
    }
  },

  setHideStackedPRs: async (enabled: boolean) => {
    await SetSetting("hide_stacked_prs", enabled ? "true" : "false");
    set({ hideStackedPRs: enabled });
  },

  loadHideCopilotReviews: async () => {
    try {
      const val = await GetSetting("hide_copilot_reviews");
      set({ hideCopilotReviews: val === "true" });
    } catch {
      set({ hideCopilotReviews: false });
    }
  },

  setHideCopilotReviews: async (enabled: boolean) => {
    await SetSetting("hide_copilot_reviews", enabled ? "true" : "false");
    set({ hideCopilotReviews: enabled });
  },

  loadCacheTTL: async () => {
    try {
      const val = await GetSetting("cache_ttl_minutes");
      const minutes = parseInt(val, 10);
      if (!isNaN(minutes) && minutes >= 1) {
        set({ cacheTTLMinutes: minutes });
        usePRStore.getState().setCacheTTL(minutes * 60 * 1000);
      }
    } catch {
      // Setting doesn't exist yet -- use default, no need to set anything.
    }
  },

  setCacheTTL: async (minutes: number) => {
    const clamped = Math.max(1, Math.min(60, Math.round(minutes)));
    await SetSetting("cache_ttl_minutes", String(clamped));
    set({ cacheTTLMinutes: clamped });
    usePRStore.getState().setCacheTTL(clamped * 60 * 1000);
  },

  loadPollInterval: async () => {
    try {
      const val = await GetSetting("poll_interval_minutes");
      const minutes = parseInt(val, 10);
      if (!isNaN(minutes) && minutes >= 1) {
        set({ pollIntervalMinutes: minutes });
      }
    } catch {
      // Setting doesn't exist yet — use default.
    }
  },

  setPollInterval: async (minutes: number) => {
    const clamped = Math.max(1, Math.min(60, Math.round(minutes)));
    await SetPollInterval(clamped);
    set({ pollIntervalMinutes: clamped });
  },

  loadTeams: async (org: string) => {
    try {
      const teams = await GetTrackedTeams(org);
      set((s) => ({
        teamsByOrg: { ...s.teamsByOrg, [org]: teams || [] },
      }));
    } catch {
      // ignore — teams stay as-is
    }
  },

  loadAllTeams: async () => {
    const { orgs, loadTeams } = get();
    await Promise.all(orgs.map((org) => loadTeams(org)));
  },

  syncTeams: async (org: string) => {
    await SyncTeamsForOrg(org);
    await get().loadTeams(org);
  },

  setTeamEnabled: async (org: string, slug: string, enabled: boolean) => {
    await SetTeamEnabled(org, slug, enabled);
    // Optimistically update local state
    set((s) => ({
      teamsByOrg: {
        ...s.teamsByOrg,
        [org]: (s.teamsByOrg[org] || []).map((t) =>
          t.teamSlug === slug ? { ...t, enabled } : t
        ),
      },
    }));
  },

  loadPriorities: async (org: string) => {
    try {
      const priorities = await GetReviewPriorities(org);
      set((s) => ({
        prioritiesByOrg: { ...s.prioritiesByOrg, [org]: priorities || [] },
      }));
    } catch {
      // ignore
    }
  },

  loadAllPriorities: async () => {
    const { orgs, loadPriorities } = get();
    await Promise.all(orgs.map((org) => loadPriorities(org)));
  },

  addPriority: async (org: string, name: string, type: string) => {
    await AddReviewPriority(org, name, type);
    await get().loadPriorities(org);
  },

  removePriority: async (org: string, name: string, type: string) => {
    await RemoveReviewPriority(org, name, type);
    await get().loadPriorities(org);
  },

  movePriority: async (org: string, name: string, type: string, direction: "up" | "down") => {
    const priorities = get().prioritiesByOrg[org] || [];
    // Priorities are sorted by priority DESC (highest first).
    const idx = priorities.findIndex((p) => p.name === name && p.type === type);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= priorities.length) return;

    const current = priorities[idx];
    const swap = priorities[swapIdx];
    // Swap priority values
    await UpdateReviewPriorityOrder(org, current.name, current.type, swap.priority);
    await UpdateReviewPriorityOrder(org, swap.name, swap.type, current.priority);
    await get().loadPriorities(org);
  },

  getPriorityNames: () => {
    const { prioritiesByOrg } = get();
    const names = new Set<string>();
    for (const orgPriorities of Object.values(prioritiesByOrg)) {
      for (const p of orgPriorities) {
        names.add(p.name);
      }
    }
    return names;
  },

  loadExcludedRepos: async (org: string) => {
    try {
      const repos = await GetExcludedRepos(org);
      set((s) => ({
        excludedReposByOrg: { ...s.excludedReposByOrg, [org]: repos || [] },
      }));
    } catch {
      // ignore
    }
  },

  loadAllExcludedRepos: async () => {
    const { orgs, loadExcludedRepos } = get();
    await Promise.all(orgs.map((org) => loadExcludedRepos(org)));
  },

  addExcludedRepo: async (org: string, repo: string) => {
    await AddExcludedRepo(org, repo);
    await get().loadExcludedRepos(org);
  },

  removeExcludedRepo: async (org: string, repo: string) => {
    await RemoveExcludedRepo(org, repo);
    await get().loadExcludedRepos(org);
  },
}));
