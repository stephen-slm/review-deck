import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVimStore } from "@/stores/vimStore";

import { KeyRound, LogOut, CheckCircle, XCircle, Loader2, Timer, RefreshCw, Palette, Settings2, Sparkles, FileText, Type } from "lucide-react";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { GetDefaultReviewPrompt, GetDefaultDescriptionPrompt, GetDefaultTitlePrompt } from "../../wailsjs/go/services/WorkspaceService";

type GlobalTab = "general" | "ai" | "advanced";

interface TabDef { key: GlobalTab; label: string; icon: typeof Settings2 }

const globalTabs: TabDef[] = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "advanced", label: "Advanced", icon: Timer },
];

export function GlobalSettingsPage() {
  const { isAuthenticated, user, error, login, logout, clearError } = useAuthStore();
  const { theme, loadTheme, setTheme, cacheTTLMinutes, loadCacheTTL, setCacheTTL, pollIntervalMinutes, loadPollInterval, setPollInterval, prRefreshIntervalSeconds, loadPRRefreshInterval, setPRRefreshInterval, aiReviewPrompt, loadAiReviewPrompt, setAiReviewPrompt, aiMaxCost, loadAiMaxCost, setAiMaxCost, aiDescriptionPrompt, loadAiDescriptionPrompt, setAiDescriptionPrompt, aiDescriptionMaxCost, loadAiDescriptionMaxCost, setAiDescriptionMaxCost, aiTitlePrompt, loadAiTitlePrompt, setAiTitlePrompt } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<GlobalTab>("general");
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load global settings on mount.
  useEffect(() => {
    loadTheme();
    loadCacheTTL();
    loadPollInterval();
    loadPRRefreshInterval();
    loadAiReviewPrompt();
    loadAiMaxCost();
    loadAiDescriptionPrompt();
    loadAiDescriptionMaxCost();
    loadAiTitlePrompt();
  }, [loadTheme, loadCacheTTL, loadPollInterval, loadPRRefreshInterval, loadAiReviewPrompt, loadAiMaxCost, loadAiDescriptionPrompt, loadAiDescriptionMaxCost, loadAiTitlePrompt]);

  // Register vim keybindings: j/k scroll, h/l and 1-3 switch tabs.
  useEffect(() => {
    const scrollEl = document.getElementById("scroll-region");
    const tabKeys: GlobalTab[] = globalTabs.map((t) => t.key);
    const currentIdx = tabKeys.indexOf(activeTab);

    useVimStore.getState().registerActions({
      onMoveDown: () => scrollEl?.scrollBy(0, 150),
      onMoveUp: () => scrollEl?.scrollBy(0, -150),
      onTabNext: () => setActiveTab(tabKeys[(currentIdx + 1) % tabKeys.length]),
      onTabPrev: () => setActiveTab(tabKeys[(currentIdx - 1 + tabKeys.length) % tabKeys.length]),
      onTabDirect: (idx: number) => {
        if (idx >= 0 && idx < tabKeys.length) setActiveTab(tabKeys[idx]);
      },
    });
    return () => useVimStore.getState().clearActions();
  }); // no deps — re-registers each render with fresh closures for activeTab

  const handleLogin = async () => {
    if (!token.trim()) return;
    setIsSubmitting(true);
    clearError();
    try {
      await login(token.trim());
      setToken("");
    } catch {
      // error is set in the store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setToken("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") action();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Global Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure application-wide preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-0.5 border-b border-border overflow-x-auto">
        <div className="flex gap-0.5">
          {globalTabs.map((tab, ti) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative inline-flex shrink-0 items-center gap-1 px-2.5 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              <kbd className="ml-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">
                {ti + 1}
              </kbd>
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === "general" && (
          <>
            {/* Authentication Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">GitHub Authentication</h3>
              </div>

              {isAuthenticated && user ? (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.login}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                          <span className="text-sm font-medium">{user.login[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{user.name || user.login}</p>
                        <p className="text-sm text-muted-foreground">@{user.login}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-sm text-green-500">
                        <CheckCircle className="h-4 w-4" />
                        Connected
                      </span>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Enter a GitHub Personal Access Token with{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">repo</code>,{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">read:org</code>, and{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">read:user</code> scopes.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, handleLogin)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      disabled={isSubmitting}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                    <button
                      onClick={handleLogin}
                      disabled={isSubmitting || !token.trim()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      Connect
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    onClick={() => BrowserOpenURL("https://github.com/settings/tokens/new?scopes=repo,read:org,read:user&description=Review+Deck")}
                    className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Generate a new token on GitHub
                  </button>
                </div>
              )}
            </section>

            {/* Appearance Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Appearance</h3>
              </div>
              <p className="text-sm text-muted-foreground">Choose a color theme for the app.</p>

              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  { key: "system" as const, label: "System", desc: "Follows OS preference", bg: "linear-gradient(135deg, #F7F9FB 50%, #2E3440 50%)" },
                  { key: "light" as const, label: "Light", desc: "Default light theme", bg: "#F7F9FB" },
                  { key: "dark" as const, label: "Dark", desc: "Default dark theme", bg: "#2E3440" },
                ] as const).map((opt) => {
                  const selected = theme === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setTheme(opt.key)}
                      className={`flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors ${
                        selected ? "border-primary ring-2 ring-ring" : "border-border hover:border-accent"
                      }`}
                      aria-pressed={selected}
                    >
                      <div
                        className="h-8 w-10 shrink-0 rounded-md border border-border shadow-sm"
                        style={{ background: opt.bg }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {activeTab === "ai" && (
          <>
            {/* AI Review Prompt */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">AI Review</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Configure the AI-powered code review. The prompt is sent as a system instruction
                when reviewing PR diffs.
              </p>

              <div className="rounded-lg border border-border bg-card p-3 space-y-4">
                {/* Prompt textarea */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                      Review prompt
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          const defaultPrompt = await GetDefaultReviewPrompt();
                          setAiReviewPrompt(defaultPrompt);
                        } catch {
                          setAiReviewPrompt("");
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reset to default
                    </button>
                  </div>
                  <textarea
                    value={aiReviewPrompt}
                    onChange={(e) => setAiReviewPrompt(e.target.value)}
                    placeholder="Leave empty to use the default prompt. The prompt instructs the AI how to review PR diffs."
                    rows={10}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the built-in default prompt. Changes apply to the next review.
                  </p>
                </div>

                {/* Max cost */}
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Max cost per review
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Maximum USD cost for a single AI review. Set to 0 or leave empty for no limit.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={aiMaxCost}
                      onChange={(e) => setAiMaxCost(e.target.value)}
                      placeholder="0.00"
                      className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* AI Description Prompt */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">PR Description Generation</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Configure the AI-powered PR description generator. This prompt instructs the AI how to
                write PR descriptions from the diff.
              </p>

              <div className="rounded-lg border border-border bg-card p-3 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                      Description prompt
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          const defaultPrompt = await GetDefaultDescriptionPrompt();
                          setAiDescriptionPrompt(defaultPrompt);
                        } catch {
                          setAiDescriptionPrompt("");
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reset to default
                    </button>
                  </div>
                  <textarea
                    value={aiDescriptionPrompt}
                    onChange={(e) => setAiDescriptionPrompt(e.target.value)}
                    placeholder="Leave empty to use the default prompt. The prompt instructs the AI how to write PR descriptions."
                    rows={8}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the built-in default prompt. Changes apply to the next description generation.
                  </p>
                </div>

                {/* Max cost for description generation */}
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Max cost per description
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Maximum USD cost for a single description generation. Set to 0 or leave empty for no limit.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={aiDescriptionMaxCost}
                      onChange={(e) => setAiDescriptionMaxCost(e.target.value)}
                      placeholder="0.00"
                      className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* AI Title Prompt */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Type className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">PR Title Generation</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Configure the AI-powered PR title generator. If the branch name contains a
                ticket prefix (e.g. JIRA-123), it will be automatically prepended to the generated title.
              </p>

              <div className="rounded-lg border border-border bg-card p-3 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                      Title prompt
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          const defaultPrompt = await GetDefaultTitlePrompt();
                          setAiTitlePrompt(defaultPrompt);
                        } catch {
                          setAiTitlePrompt("");
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reset to default
                    </button>
                  </div>
                  <textarea
                    value={aiTitlePrompt}
                    onChange={(e) => setAiTitlePrompt(e.target.value)}
                    placeholder="Leave empty to use the default prompt. The prompt instructs the AI how to generate PR titles."
                    rows={6}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the built-in default prompt. Changes apply to the next title generation.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === "advanced" && (
          <>
            {/* Cache Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Cache & Polling</h3>
              </div>

              <div className="rounded-lg border border-border bg-card p-3 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Cache expiry
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Data is served from cache unless you click Refresh. Pages will
                      re-fetch from GitHub after this period.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={cacheTTLMinutes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setCacheTTL(val);
                      }}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Poll interval
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      How often the background poller fetches new data from GitHub.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={pollIntervalMinutes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setPollInterval(val);
                      }}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      PR detail refresh interval
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      How often the PR detail page auto-refreshes data from GitHub.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10}
                      max={300}
                      value={prRefreshIntervalSeconds}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setPRRefreshInterval(val);
                      }}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">sec</span>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
