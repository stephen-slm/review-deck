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
import { ThemeChoice, themeChoices } from "../theme";

const DEFAULT_THEME: ThemeChoice = "system";

const DEFAULT_CACHE_TTL_MINUTES = 5;
const DEFAULT_POLL_INTERVAL_MINUTES = 5;
const DEFAULT_PR_REFRESH_INTERVAL_SECONDS = 30;

const DEFAULT_FILTERED_COMMENT_USERS = ["copilot-pull-request-reviewer[bot]", "github-actions[bot]"];
const DEFAULT_FILTERED_REVIEW_USERS = ["copilot-pull-request-reviewer[bot]", "github-actions[bot]"];

interface SettingsState {
  orgs: string[];
  filterBots: boolean;
  hideStackedPRs: boolean;
  hideDraftPRs: boolean;
  /** Usernames whose comments (issue comments & review threads) are filtered out on the PR detail page. */
  filteredCommentUsers: string[];
  /** Usernames whose reviews are filtered out on the PR detail page (Reviews section, Reviewers sidebar). */
  filteredReviewUsers: string[];
  theme: ThemeChoice;
  cacheTTLMinutes: number;
  pollIntervalMinutes: number;
  /** How often the PR detail page auto-refreshes (in seconds). */
  prRefreshIntervalSeconds: number;
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
  loadHideDraftPRs: () => Promise<void>;
  setHideDraftPRs: (enabled: boolean) => Promise<void>;
  loadFilteredCommentUsers: () => Promise<void>;
  setFilteredCommentUsers: (users: string[]) => Promise<void>;
  loadFilteredReviewUsers: () => Promise<void>;
  setFilteredReviewUsers: (users: string[]) => Promise<void>;
  loadTheme: () => Promise<void>;
  setTheme: (theme: ThemeChoice) => Promise<void>;
  loadCacheTTL: () => Promise<void>;
  setCacheTTL: (minutes: number) => Promise<void>;
  loadPollInterval: () => Promise<void>;
  setPollInterval: (minutes: number) => Promise<void>;
  loadPRRefreshInterval: () => Promise<void>;
  setPRRefreshInterval: (seconds: number) => Promise<void>;
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

  /** Base path for local source code (used for Open in GoLand) */
  sourceBasePath: string;
  loadSourceBasePath: () => Promise<void>;
  setSourceBasePath: (path: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  orgs: [],
  filterBots: false,
  hideStackedPRs: false,
  hideDraftPRs: false,
  filteredCommentUsers: DEFAULT_FILTERED_COMMENT_USERS,
  filteredReviewUsers: DEFAULT_FILTERED_REVIEW_USERS,
  theme: DEFAULT_THEME,
  cacheTTLMinutes: DEFAULT_CACHE_TTL_MINUTES,
  pollIntervalMinutes: DEFAULT_POLL_INTERVAL_MINUTES,
  prRefreshIntervalSeconds: DEFAULT_PR_REFRESH_INTERVAL_SECONDS,
  teamsByOrg: {},
  prioritiesByOrg: {},
  excludedReposByOrg: {},
  sourceBasePath: "",
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

  loadHideDraftPRs: async () => {
    try {
      const val = await GetSetting("hide_draft_prs");
      set({ hideDraftPRs: val === "true" });
    } catch {
      set({ hideDraftPRs: false });
    }
  },

  setHideDraftPRs: async (enabled: boolean) => {
    await SetSetting("hide_draft_prs", enabled ? "true" : "false");
    set({ hideDraftPRs: enabled });
  },

  loadFilteredCommentUsers: async () => {
    try {
      const val = await GetSetting("filtered_comment_users");
      if (val) {
        const parsed = JSON.parse(val) as string[];
        if (Array.isArray(parsed)) {
          set({ filteredCommentUsers: parsed });
          return;
        }
      }
    } catch {
      // Setting doesn't exist yet or invalid JSON — check legacy setting.
    }
    // Migrate from legacy hide_copilot_reviews boolean if it was enabled.
    try {
      const legacy = await GetSetting("hide_copilot_reviews");
      if (legacy === "true") {
        set({ filteredCommentUsers: DEFAULT_FILTERED_COMMENT_USERS });
        await SetSetting("filtered_comment_users", JSON.stringify(DEFAULT_FILTERED_COMMENT_USERS));
        return;
      }
    } catch { /* ignore */ }
    set({ filteredCommentUsers: DEFAULT_FILTERED_COMMENT_USERS });
  },

  setFilteredCommentUsers: async (users: string[]) => {
    await SetSetting("filtered_comment_users", JSON.stringify(users));
    set({ filteredCommentUsers: users });
  },

  loadFilteredReviewUsers: async () => {
    try {
      const val = await GetSetting("filtered_review_users");
      if (val) {
        const parsed = JSON.parse(val) as string[];
        if (Array.isArray(parsed)) {
          set({ filteredReviewUsers: parsed });
          return;
        }
      }
    } catch {
      // Setting doesn't exist yet or invalid JSON — check legacy setting.
    }
    // Migrate from legacy hide_copilot_reviews boolean if it was enabled.
    try {
      const legacy = await GetSetting("hide_copilot_reviews");
      if (legacy === "true") {
        set({ filteredReviewUsers: DEFAULT_FILTERED_REVIEW_USERS });
        await SetSetting("filtered_review_users", JSON.stringify(DEFAULT_FILTERED_REVIEW_USERS));
        return;
      }
    } catch { /* ignore */ }
    set({ filteredReviewUsers: DEFAULT_FILTERED_REVIEW_USERS });
  },

  setFilteredReviewUsers: async (users: string[]) => {
    await SetSetting("filtered_review_users", JSON.stringify(users));
    set({ filteredReviewUsers: users });
  },

  loadTheme: async () => {
    try {
      const val = await GetSetting("theme");
      if (themeChoices.includes(val as ThemeChoice)) {
        set({ theme: val as ThemeChoice });
        return;
      }
    } catch {
      // fall through to default
    }
    set({ theme: DEFAULT_THEME });
  },

  setTheme: async (theme: ThemeChoice) => {
    await SetSetting("theme", theme);
    set({ theme });
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

  loadPRRefreshInterval: async () => {
    try {
      const val = await GetSetting("pr_refresh_interval_seconds");
      const seconds = parseInt(val, 10);
      if (!isNaN(seconds) && seconds >= 10) {
        set({ prRefreshIntervalSeconds: seconds });
      }
    } catch {
      // Setting doesn't exist yet — use default.
    }
  },

  setPRRefreshInterval: async (seconds: number) => {
    const clamped = Math.max(10, Math.min(300, Math.round(seconds)));
    await SetSetting("pr_refresh_interval_seconds", String(clamped));
    set({ prRefreshIntervalSeconds: clamped });
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

  loadSourceBasePath: async () => {
    try {
      const val = await GetSetting("source_base_path");
      set({ sourceBasePath: val || "" });
    } catch {
      set({ sourceBasePath: "" });
    }
  },

  setSourceBasePath: async (path: string) => {
    await SetSetting("source_base_path", path);
    set({ sourceBasePath: path });
  },
}));
