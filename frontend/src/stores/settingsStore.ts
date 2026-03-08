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
  GetCachedRepoLabels,
} from "../../wailsjs/go/services/SettingsService";
import { SyncTeamsForOrg, GetRepoLabels } from "../../wailsjs/go/services/PullRequestService";
import { SetPollInterval } from "../../wailsjs/go/main/App";
import { github, storage } from "../../wailsjs/go/models";
import { usePRStore } from "./prStore";
import { ThemeChoice, themeChoices } from "../theme";
import { dlog } from "@/lib/debugLog";
import { PRSizeThresholds, DEFAULT_PR_SIZE_THRESHOLDS } from "@/lib/prSizes";

const DEFAULT_THEME: ThemeChoice = "system";

const DEFAULT_CACHE_TTL_MINUTES = 5;
const DEFAULT_POLL_INTERVAL_MINUTES = 5;
const DEFAULT_PR_REFRESH_INTERVAL_SECONDS = 30;

const DEFAULT_FILTERED_COMMENT_USERS = ["copilot-pull-request-reviewer[bot]", "github-actions[bot]"];
const DEFAULT_FILTERED_REVIEW_USERS = ["copilot-pull-request-reviewer[bot]", "github-actions[bot]"];

interface SettingsState {
  orgs: string[];
  /** The repo identifier (owner/name) that repo-scoped settings are currently loaded for. */
  repoId: string;
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
  /** Load all repo-scoped settings for the given repo (owner/name). Falls back to global values for migration. */
  loadRepoSettings: (repoId: string) => Promise<void>;
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

  /** Cached repo labels keyed by "owner/repo" */
  labelsByRepo: Record<string, github.Label[]>;
  /** Load labels from local DB cache for a specific repo. */
  loadLabels: (owner: string, repo: string) => Promise<void>;
  /** Sync (fetch) labels from GitHub for a specific repo, persisting to DB. */
  syncLabels: (owner: string, repo: string) => Promise<void>;

  /** Base path for local source code (used for Open in GoLand) */
  sourceBasePath: string;
  loadSourceBasePath: () => Promise<void>;
  setSourceBasePath: (path: string) => Promise<void>;

  /** Custom AI review prompt (empty = use default) */
  aiReviewPrompt: string;
  loadAiReviewPrompt: () => Promise<void>;
  setAiReviewPrompt: (prompt: string) => Promise<void>;

  /** Max cost per AI review in USD (0 = unlimited) */
  aiMaxCost: string;
  loadAiMaxCost: () => Promise<void>;
  setAiMaxCost: (cost: string) => Promise<void>;

  /** Custom AI description generation prompt (empty = use default) */
  aiDescriptionPrompt: string;
  loadAiDescriptionPrompt: () => Promise<void>;
  setAiDescriptionPrompt: (prompt: string) => Promise<void>;

  /** Max cost per AI description generation in USD (0 = unlimited) */
  aiDescriptionMaxCost: string;
  loadAiDescriptionMaxCost: () => Promise<void>;
  setAiDescriptionMaxCost: (cost: string) => Promise<void>;

  /** Custom AI title generation prompt (empty = use default) */
  aiTitlePrompt: string;
  loadAiTitlePrompt: () => Promise<void>;
  setAiTitlePrompt: (prompt: string) => Promise<void>;

  /** Configurable thresholds that define PR size buckets (S / M / L / XL / XXL). */
  prSizeThresholds: PRSizeThresholds;
  loadPRSizeThresholds: () => Promise<void>;
  setPRSizeThresholds: (thresholds: PRSizeThresholds) => Promise<void>;
}

/** Return the repo-scoped setting key, e.g. `repo:acme/my-app:filter_bots`. */
function repoKey(repoId: string, key: string): string {
  return `repo:${repoId}:${key}`;
}

/**
 * Try reading a repo-scoped setting; if missing, fall back to the global key.
 * When falling back, the global value is materialised into the repo-scoped key
 * so that each repository gets its own independent copy from that point on.
 */
async function getRepoSetting(repoId: string, key: string): Promise<string> {
  if (repoId) {
    try {
      const val = await GetSetting(repoKey(repoId, key));
      if (val !== undefined && val !== null && val !== "") return val;
    } catch { /* fall through to global */ }
  }
  // Fall back to the global value.
  const globalVal = await GetSetting(key).catch(() => "");
  // Materialise the fallback into the repo-scoped key so each repo is
  // independent going forward.
  if (repoId && globalVal) {
    SetSetting(repoKey(repoId, key), globalVal).catch(() => {});
  }
  return globalVal;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  orgs: [],
  repoId: "",
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
  prSizeThresholds: DEFAULT_PR_SIZE_THRESHOLDS,
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

  loadRepoSettings: async (repoId: string) => {
    dlog("settings:loadRepo", `start repoId="${repoId}"`);
    set({ repoId });
    // Reload all repo-scoped settings for the new repo.
    const [owner, repo] = repoId.split("/");
    await Promise.all([
      get().loadFilterBots(),
      get().loadHideStackedPRs(),
      get().loadHideDraftPRs(),
      get().loadFilteredCommentUsers(),
      get().loadFilteredReviewUsers(),
      owner && repo ? get().loadLabels(owner, repo) : Promise.resolve(),
    ]);
    dlog("settings:loadRepo", `done repoId="${repoId}"`);
  },

  loadFilterBots: async () => {
    try {
      const val = await getRepoSetting(get().repoId, "filter_bots");
      dlog("settings:set", `filterBots=${val === "true"}`);
      set({ filterBots: val === "true" });
    } catch {
      set({ filterBots: false });
    }
  },

  setFilterBots: async (enabled: boolean) => {
    const owner = get().repoId;
    const v = enabled ? "true" : "false";
    if (owner) await SetSetting(repoKey(owner, "filter_bots"), v);
    await SetSetting("filter_bots", v); // keep global in sync for backend poller
    set({ filterBots: enabled });
  },

  loadHideStackedPRs: async () => {
    try {
      const val = await getRepoSetting(get().repoId, "hide_stacked_prs");
      set({ hideStackedPRs: val === "true" });
    } catch {
      set({ hideStackedPRs: false });
    }
  },

  setHideStackedPRs: async (enabled: boolean) => {
    const owner = get().repoId;
    const v = enabled ? "true" : "false";
    if (owner) await SetSetting(repoKey(owner, "hide_stacked_prs"), v);
    await SetSetting("hide_stacked_prs", v);
    set({ hideStackedPRs: enabled });
  },

  loadHideDraftPRs: async () => {
    try {
      const val = await getRepoSetting(get().repoId, "hide_draft_prs");
      set({ hideDraftPRs: val === "true" });
    } catch {
      set({ hideDraftPRs: false });
    }
  },

  setHideDraftPRs: async (enabled: boolean) => {
    const owner = get().repoId;
    const v = enabled ? "true" : "false";
    if (owner) await SetSetting(repoKey(owner, "hide_draft_prs"), v);
    await SetSetting("hide_draft_prs", v);
    set({ hideDraftPRs: enabled });
  },

  loadFilteredCommentUsers: async () => {
    try {
      const val = await getRepoSetting(get().repoId, "filtered_comment_users");
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
        const owner = get().repoId;
        const key = owner ? repoKey(owner, "filtered_comment_users") : "filtered_comment_users";
        await SetSetting(key, JSON.stringify(DEFAULT_FILTERED_COMMENT_USERS));
        return;
      }
    } catch { /* ignore */ }
    set({ filteredCommentUsers: DEFAULT_FILTERED_COMMENT_USERS });
  },

  setFilteredCommentUsers: async (users: string[]) => {
    const owner = get().repoId;
    const v = JSON.stringify(users);
    if (owner) await SetSetting(repoKey(owner, "filtered_comment_users"), v);
    await SetSetting("filtered_comment_users", v);
    set({ filteredCommentUsers: users });
  },

  loadFilteredReviewUsers: async () => {
    try {
      const val = await getRepoSetting(get().repoId, "filtered_review_users");
      if (val) {
        const parsed = JSON.parse(val) as string[];
        if (Array.isArray(parsed)) {
          dlog("settings:set", `filteredReviewUsers=${parsed.length} items`);
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
        const owner = get().repoId;
        const key = owner ? repoKey(owner, "filtered_review_users") : "filtered_review_users";
        await SetSetting(key, JSON.stringify(DEFAULT_FILTERED_REVIEW_USERS));
        return;
      }
    } catch { /* ignore */ }
    set({ filteredReviewUsers: DEFAULT_FILTERED_REVIEW_USERS });
  },

  setFilteredReviewUsers: async (users: string[]) => {
    const owner = get().repoId;
    const v = JSON.stringify(users);
    if (owner) await SetSetting(repoKey(owner, "filtered_review_users"), v);
    await SetSetting("filtered_review_users", v);
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

  labelsByRepo: {},

  loadLabels: async (owner: string, repo: string) => {
    try {
      const labels = await GetCachedRepoLabels(owner, repo);
      const key = `${owner}/${repo}`;
      set((s) => ({
        labelsByRepo: { ...s.labelsByRepo, [key]: labels || [] },
      }));
    } catch {
      // ignore — labels stay as-is
    }
  },

  syncLabels: async (owner: string, repo: string) => {
    // Fetch from GitHub (backend persists to DB), then reload from DB.
    await GetRepoLabels(owner, repo);
    await get().loadLabels(owner, repo);
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

  aiReviewPrompt: "",
  loadAiReviewPrompt: async () => {
    try {
      const val = await GetSetting("ai_review_prompt");
      set({ aiReviewPrompt: val || "" });
    } catch {
      set({ aiReviewPrompt: "" });
    }
  },
  setAiReviewPrompt: async (prompt: string) => {
    if (prompt.trim() === "") {
      // Delete the setting so backend falls back to default.
      await SetSetting("ai_review_prompt", "");
    } else {
      await SetSetting("ai_review_prompt", prompt);
    }
    set({ aiReviewPrompt: prompt });
  },

  aiMaxCost: "",
  loadAiMaxCost: async () => {
    try {
      const val = await GetSetting("ai_max_cost");
      set({ aiMaxCost: val || "" });
    } catch {
      set({ aiMaxCost: "" });
    }
  },
  setAiMaxCost: async (cost: string) => {
    await SetSetting("ai_max_cost", cost);
    set({ aiMaxCost: cost });
  },

  aiDescriptionPrompt: "",
  loadAiDescriptionPrompt: async () => {
    try {
      const val = await GetSetting("ai_description_prompt");
      set({ aiDescriptionPrompt: val || "" });
    } catch {
      set({ aiDescriptionPrompt: "" });
    }
  },
  setAiDescriptionPrompt: async (prompt: string) => {
    if (prompt.trim() === "") {
      await SetSetting("ai_description_prompt", "");
    } else {
      await SetSetting("ai_description_prompt", prompt);
    }
    set({ aiDescriptionPrompt: prompt });
  },

  aiDescriptionMaxCost: "",
  loadAiDescriptionMaxCost: async () => {
    try {
      const val = await GetSetting("ai_description_max_cost");
      set({ aiDescriptionMaxCost: val || "" });
    } catch {
      set({ aiDescriptionMaxCost: "" });
    }
  },
  setAiDescriptionMaxCost: async (cost: string) => {
    await SetSetting("ai_description_max_cost", cost);
    set({ aiDescriptionMaxCost: cost });
  },

  aiTitlePrompt: "",
  loadAiTitlePrompt: async () => {
    try {
      const val = await GetSetting("ai_title_prompt");
      set({ aiTitlePrompt: val || "" });
    } catch {
      set({ aiTitlePrompt: "" });
    }
  },
  setAiTitlePrompt: async (prompt: string) => {
    if (prompt.trim() === "") {
      await SetSetting("ai_title_prompt", "");
    } else {
      await SetSetting("ai_title_prompt", prompt);
    }
    set({ aiTitlePrompt: prompt });
  },

  loadPRSizeThresholds: async () => {
    try {
      const val = await GetSetting("pr_size_thresholds");
      if (val) {
        const parsed = JSON.parse(val) as PRSizeThresholds;
        if (
          typeof parsed.xs === "number" &&
          typeof parsed.s === "number" &&
          typeof parsed.m === "number" &&
          typeof parsed.l === "number" &&
          typeof parsed.xl === "number"
        ) {
          set({ prSizeThresholds: parsed });
          return;
        }
      }
    } catch {
      // Setting doesn't exist yet or invalid JSON — use default.
    }
    set({ prSizeThresholds: DEFAULT_PR_SIZE_THRESHOLDS });
  },

  setPRSizeThresholds: async (thresholds: PRSizeThresholds) => {
    await SetSetting("pr_size_thresholds", JSON.stringify(thresholds));
    set({ prSizeThresholds: thresholds });
  },
}));
