import { create } from "zustand";
import { storage } from "../../wailsjs/go/models";
import {
  AddRepo,
  GetTrackedRepos,
  RemoveRepo,
} from "../../wailsjs/go/services/RepoService";
import {
  GetSetting,
  SetSetting,
} from "../../wailsjs/go/services/SettingsService";
import { usePRStore } from "./prStore";
import { dlog } from "@/lib/debugLog";

interface RepoState {
  repos: storage.TrackedRepo[];
  selectedRepoId: number | null;
  isLoading: boolean;
  error: string | null;

  /** The currently selected repo (derived). */
  selectedRepo: storage.TrackedRepo | null;

  /** Load all tracked repos from the backend. */
  loadRepos: () => Promise<void>;
  /** Open the folder picker and add a new repo. */
  addRepo: () => Promise<storage.TrackedRepo | null>;
  /** Remove a tracked repo by ID. */
  removeRepo: (id: number) => Promise<void>;
  /** Select a repo by ID. */
  selectRepo: (id: number) => void;
  /** Load persisted selected repo ID from settings. */
  loadSelectedRepo: () => Promise<void>;
  /** Clear error. */
  clearError: () => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  selectedRepoId: null,
  isLoading: false,
  error: null,
  selectedRepo: null,

  loadRepos: async () => {
    dlog("repo:loadRepos", "starting");
    try {
      const repos = await GetTrackedRepos();
      const current = get().selectedRepoId;
      const validSelection = current != null && repos.some((r) => r.id === current);
      const selectedId = validSelection ? current : repos.length > 0 ? repos[0].id : null;
      const selected = repos?.find((r) => r.id === selectedId) ?? null;
      dlog("repo:loadRepos", `count=${repos.length} selectedId=${selectedId} selected=${selected ? `${selected.repoOwner}/${selected.repoName}` : "(none)"}`);
      set({
        repos: repos || [],
        selectedRepoId: selectedId,
        selectedRepo: selected,
      });
    } catch (err) {
      dlog("repo:loadRepos", `ERROR: ${err}`);
      set({ error: String(err) });
    }
  },

  addRepo: async () => {
    set({ isLoading: true, error: null });
    try {
      const repo = await AddRepo();
      if (!repo || !repo.id) {
        // User cancelled folder picker.
        set({ isLoading: false });
        return null;
      }
      // Reload the full list so everything is consistent.
      await get().loadRepos();
      // Auto-select the newly added repo.
      set({
        selectedRepoId: repo.id,
        selectedRepo: repo,
        isLoading: false,
      });
      await SetSetting("selected_repo_id", String(repo.id));
      return repo;
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return null;
    }
  },

  removeRepo: async (id: number) => {
    try {
      await RemoveRepo(id);
      await get().loadRepos();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  selectRepo: (id: number) => {
    const prev = get().selectedRepoId;
    const repo = get().repos.find((r) => r.id === id) ?? null;
    dlog("repo:selectRepo", `id=${id} prev=${prev} repo=${repo ? `${repo.repoOwner}/${repo.repoName}` : "(none)"} willReset=${prev !== id}`);
    set({ selectedRepoId: id, selectedRepo: repo });
    SetSetting("selected_repo_id", String(id)).catch(() => {});
    if (prev !== id) {
      usePRStore.getState().resetPages();
    }
  },

  loadSelectedRepo: async () => {
    try {
      const val = await GetSetting("selected_repo_id");
      dlog("repo:loadSelectedRepo", `persisted="${val}"`);
      if (val) {
        const id = parseInt(val, 10);
        if (!isNaN(id) && id > 0) {
          set((state) => {
            const found = state.repos.find((r) => r.id === id) ?? null;
            dlog("repo:loadSelectedRepo", `applying id=${id} found=${found ? `${found.repoOwner}/${found.repoName}` : "(none)"}`);
            return {
              selectedRepoId: id,
              selectedRepo: found,
            };
          });
        }
      }
    } catch {
      dlog("repo:loadSelectedRepo", "no persisted selection");
    }
  },

  clearError: () => set({ error: null }),
}));
