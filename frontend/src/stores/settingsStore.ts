import { create } from "zustand";
import {
  GetTrackedOrgs,
  AddTrackedOrg,
  RemoveTrackedOrg,
} from "../../wailsjs/go/services/SettingsService";

interface SettingsState {
  orgs: string[];
  isLoading: boolean;

  loadOrgs: () => Promise<void>;
  addOrg: (org: string) => Promise<void>;
  removeOrg: (org: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  orgs: [],
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
}));
