import { create } from "zustand";
import { Login, Logout, IsAuthenticated, GetUser } from "../../wailsjs/go/services/AuthService";
import { StartPoller, StopPoller } from "../../wailsjs/go/main/App";
import { github } from "../../wailsjs/go/models";

interface AuthState {
  isAuthenticated: boolean;
  user: github.ViewerInfo | null;
  isLoading: boolean;
  error: string | null;

  checkAuth: () => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const authed = await IsAuthenticated();
      if (authed) {
        const user = await GetUser();
        set({ isAuthenticated: true, user, isLoading: false });
      } else {
        set({ isAuthenticated: false, user: null, isLoading: false });
      }
    } catch {
      set({ isAuthenticated: false, user: null, isLoading: false });
    }
  },

  login: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const user = await Login(token);
      set({ isAuthenticated: true, user, isLoading: false, error: null });
      // Start background polling after successful login.
      StartPoller().catch(console.error);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isAuthenticated: false, user: null, isLoading: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    try {
      StopPoller().catch(console.error);
      await Logout();
    } finally {
      set({ isAuthenticated: false, user: null, error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
