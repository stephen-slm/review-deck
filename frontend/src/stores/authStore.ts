import { create } from "zustand";
import { Login, Logout, IsAuthenticated, GetUser } from "../../wailsjs/go/services/AuthService";
import { StartPoller, StopPoller } from "../../wailsjs/go/main/App";
import { github } from "../../wailsjs/go/models";
import { dlog } from "@/lib/debugLog";

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
    dlog("auth:checkAuth", "starting");
    set({ isLoading: true, error: null });
    try {
      const authed = await IsAuthenticated();
      dlog("auth:checkAuth", `IsAuthenticated=${authed}`);
      if (authed) {
        const user = await GetUser();
        dlog("auth:checkAuth", `user=${user?.login ?? "(null)"}`);
        set({ isAuthenticated: true, user, isLoading: false });
      } else {
        dlog("auth:checkAuth", "not authenticated");
        set({ isAuthenticated: false, user: null, isLoading: false });
      }
    } catch (err) {
      dlog("auth:checkAuth", `ERROR: ${err}`);
      set({ isAuthenticated: false, user: null, isLoading: false });
    }
  },

  login: async (token: string) => {
    dlog("auth:login", "starting");
    set({ isLoading: true, error: null });
    try {
      const user = await Login(token);
      dlog("auth:login", `OK user=${user?.login ?? "(null)"}`);
      set({ isAuthenticated: true, user, isLoading: false, error: null });
      StartPoller().catch(console.error);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      dlog("auth:login", `ERROR: ${message}`);
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
