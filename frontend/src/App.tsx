import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { ToastProvider } from "./components/ui/Toast";
import { MyPRsPage } from "./pages/MyPRsPage";
import { ReviewRequestsPage } from "./pages/ReviewRequestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { FlaggedPRsPage } from "./pages/FlaggedPRsPage";
import { PRDetailPage } from "./pages/PRDetailPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ShortcutHintBar } from "./components/layout/ShortcutHintBar";
import { usePollerEvents } from "./hooks/usePollerEvents";
import { useVimNavigation } from "./hooks/useVimNavigation";
import { useWindowFocus } from "./hooks/useWindowFocus";
import { usePRStore } from "./stores/prStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useFlagStore } from "./stores/flagStore";
import { useRepoStore } from "./stores/repoStore";

function AppContent() {
  // Listen for backend poller events and push data into stores.
  usePollerEvents();
  // Global VIM-style keyboard navigation.
  useVimNavigation();
  // Re-focus webview content when the native window regains focus (fixes
  // vim keys breaking after Cmd+Tab in production Wails builds on macOS).
  useWindowFocus();

  const repos = useRepoStore((s) => s.repos);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  // Hydrate persisted settings and cache timestamps on startup.
  useEffect(() => {
    usePRStore.getState().loadCacheTimestamps();
    usePRStore.getState().loadHiddenPRs();
    useSettingsStore.getState().loadPRRefreshInterval();
    // Load repos and persisted selection — repo-scoped settings are loaded
    // by the selectedRepo effect below once the selection is known.
    useRepoStore.getState().loadRepos().then(() => {
      useRepoStore.getState().loadSelectedRepo();
    });
  }, []);

  // Reload repo-scoped settings whenever the selected repo changes.
  useEffect(() => {
    const owner = selectedRepo?.repoOwner || "";
    useSettingsStore.getState().loadRepoSettings(owner);
    useFlagStore.getState().loadRules(owner);
  }, [selectedRepo?.repoOwner]);

  // Show onboarding if no repos are tracked yet.
  const showOnboarding = repos.length === 0 || !selectedRepo;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* macOS titlebar spacer — drag region */}
        <div className="wails-drag h-[38px] shrink-0" />
        <div id="scroll-region" className="flex-1 overflow-auto p-4">
          <Routes>
            <Route
              path="/"
              element={
                <Navigate to={showOnboarding ? "/onboarding" : "/my-prs"} replace />
              }
            />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/my-prs" element={<MyPRsPage />} />
            <Route
              path="/review-requests"
              element={<ReviewRequestsPage />}
            />
            <Route path="/flagged" element={<FlaggedPRsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/pr/:nodeId" element={<PRDetailPage />} />
          </Routes>
        </div>
        <ShortcutHintBar />
        {/* Persistent hint indicator */}
        <div className="flex shrink-0 items-center justify-end border-t border-border px-3 py-1">
          <span className="text-[10px] text-muted-foreground/50">
            Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">?</kbd> for shortcuts
          </span>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ToastProvider>
  );
}
