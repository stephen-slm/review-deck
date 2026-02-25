import { create } from "zustand";
import {
  GetTrackedOrgs,
  AddTrackedOrg,
  RemoveTrackedOrg,
  GetSetting,
  SetSetting,
  GetTrackedTeams,
  SetTeamEnabled,
} from "../../wailsjs/go/services/SettingsService";
import { SyncTeamsForOrg } from "../../wailsjs/go/services/PullRequestService";
import { storage } from "../../wailsjs/go/models";
import { usePRStore } from "./prStore";

const DEFAULT_CACHE_TTL_MINUTES = 5;

interface SettingsState {
  orgs: string[];
  filterBots: boolean;
  cacheTTLMinutes: number;
  /** Tracked teams keyed by org name */
  teamsByOrg: Record<string, storage.TrackedTeam[]>;
  isLoading: boolean;

  loadOrgs: () => Promise<void>;
  addOrg: (org: string) => Promise<void>;
  removeOrg: (org: string) => Promise<void>;
  loadFilterBots: () => Promise<void>;
  setFilterBots: (enabled: boolean) => Promise<void>;
  loadCacheTTL: () => Promise<void>;
  setCacheTTL: (minutes: number) => Promise<void>;
  loadTeams: (org: string) => Promise<void>;
  loadAllTeams: () => Promise<void>;
  syncTeams: (org: string) => Promise<void>;
  setTeamEnabled: (org: string, slug: string, enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  orgs: [],
  filterBots: false,
  cacheTTLMinutes: DEFAULT_CACHE_TTL_MINUTES,
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
}));
