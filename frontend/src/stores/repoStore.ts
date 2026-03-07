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

/** Sentinel value used for the "All Repos" selection. */
export const ALL_REPOS_ID = -1;

interface RepoState {
  repos: storage.TrackedRepo[];
  selectedRepoId: number | null;
  isLoading: boolean;
  error: string | null;

  /** The currently selected repo (derived). null when "All Repos" is active. */
  selectedRepo: storage.TrackedRepo | null;

  /** Whether the user has selected the "All Repos" aggregate view. */
  isAllRepos: boolean;

  /** Load all tracked repos from the backend. */
  loadRepos: () => Promise<void>;
  /** Open the folder picker and add a new repo. */
  addRepo: () => Promise<storage.TrackedRepo | null>;
  /** Remove a tracked repo by ID. */
  removeRepo: (id: number) => Promise<void>;
  /** Select a repo by ID. */
  selectRepo: (id: number) => void;
  /** Select the "All Repos" aggregate view. */
  selectAllRepos: () => void;
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
  isAllRepos: false,

  loadRepos: async () => {
    try {
      const repos = await GetTrackedRepos();
      const current = get().selectedRepoId;
      // Preserve "All Repos" selection.
      if (current === ALL_REPOS_ID) {
        set({ repos: repos || [], isAllRepos: true, selectedRepo: null });
        return;
      }
      // If selected repo no longer exists in the list, auto-select first.
      const validSelection = current != null && repos.some((r) => r.id === current);
      const selectedId = validSelection ? current : repos.length > 0 ? repos[0].id : null;
      set({
        repos: repos || [],
        selectedRepoId: selectedId,
        selectedRepo: repos?.find((r) => r.id === selectedId) ?? null,
        isAllRepos: false,
      });
    } catch (err) {
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
    const wasAllRepos = get().isAllRepos;
    const repo = get().repos.find((r) => r.id === id) ?? null;
    set({ selectedRepoId: id, selectedRepo: repo, isAllRepos: false });
    SetSetting("selected_repo_id", String(id)).catch(() => {});
    // When the repo actually changes (or switching from all-repos mode),
    // clear all cached PR pages so pages re-fetch for the new repo.
    if (prev !== id || wasAllRepos) {
      usePRStore.getState().resetPages();
    }
  },

  selectAllRepos: () => {
    const wasAllRepos = get().isAllRepos;
    set({ selectedRepoId: ALL_REPOS_ID, selectedRepo: null, isAllRepos: true });
    SetSetting("selected_repo_id", String(ALL_REPOS_ID)).catch(() => {});
    if (!wasAllRepos) {
      usePRStore.getState().resetPages();
    }
  },

  loadSelectedRepo: async () => {
    try {
      const val = await GetSetting("selected_repo_id");
      if (val) {
        const id = parseInt(val, 10);
        if (!isNaN(id)) {
          if (id === ALL_REPOS_ID) {
            set({ selectedRepoId: ALL_REPOS_ID, selectedRepo: null, isAllRepos: true });
          } else {
            set((state) => ({
              selectedRepoId: id,
              selectedRepo: state.repos.find((r) => r.id === id) ?? null,
              isAllRepos: false,
            }));
          }
        }
      }
    } catch {
      // no persisted selection, that's fine
    }
  },

  clearError: () => set({ error: null }),
}));
