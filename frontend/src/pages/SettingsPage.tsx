import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRepoStore } from "@/stores/repoStore";
import { useVimStore } from "@/stores/vimStore";

import { KeyRound, LogOut, Plus, Trash2, CheckCircle, XCircle, Loader2, Bot, Timer, Users, RefreshCw, Star, ChevronUp, ChevronDown, FolderGit2, Palette, AlertTriangle, Settings2, Shield, Crown, Sparkles, FileText } from "lucide-react";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { GetOrgMembers } from "../../wailsjs/go/services/PullRequestService";
import { GetDefaultReviewPrompt, GetDefaultDescriptionPrompt } from "../../wailsjs/go/services/WorkspaceService";
import { github } from "../../wailsjs/go/models";
import { useFlagStore } from "@/stores/flagStore";

type SettingsTab = "general" | "filters" | "teams" | "rules" | "ai" | "advanced";

const settingsTabs: { key: SettingsTab; label: string; icon: typeof Settings2 }[] = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "filters", label: "Filters", icon: Bot },
  { key: "teams", label: "Teams & Priority", icon: Crown },
  { key: "rules", label: "Flag Rules", icon: AlertTriangle },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "advanced", label: "Advanced", icon: Timer },
];

export function SettingsPage() {
  const { isAuthenticated, user, error, login, logout, clearError } = useAuthStore();
  const { loadOrgs, filterBots, loadFilterBots, setFilterBots, hideStackedPRs, loadHideStackedPRs, setHideStackedPRs, hideDraftPRs, loadHideDraftPRs, setHideDraftPRs, filteredCommentUsers, loadFilteredCommentUsers, setFilteredCommentUsers, filteredReviewUsers, loadFilteredReviewUsers, setFilteredReviewUsers, theme, loadTheme, setTheme, cacheTTLMinutes, loadCacheTTL, setCacheTTL, pollIntervalMinutes, loadPollInterval, setPollInterval, prRefreshIntervalSeconds, loadPRRefreshInterval, setPRRefreshInterval, teamsByOrg, loadAllTeams, syncTeams, setTeamEnabled, prioritiesByOrg, loadAllPriorities, addPriority, removePriority, movePriority, aiReviewPrompt, loadAiReviewPrompt, setAiReviewPrompt, aiMaxCost, loadAiMaxCost, setAiMaxCost, aiDescriptionPrompt, loadAiDescriptionPrompt, setAiDescriptionPrompt } = useSettingsStore();
  const { repos, selectedRepoId, selectRepo, addRepo, removeRepo, loadRepos, isLoading: repoLoading } = useRepoStore();

  // Derive unique org names from tracked repos for team/priority features.
  const derivedOrgs = useMemo(() => {
    const owners = new Set(repos.map((r) => r.repoOwner));
    return Array.from(owners).sort();
  }, [repos]);

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingOrg, setSyncingOrg] = useState<string | null>(null);
  const [newPriorityName, setNewPriorityName] = useState("");
  const [newPriorityType, setNewPriorityType] = useState<"user" | "team">("user");

  const [membersByOrg, setMembersByOrg] = useState<Record<string, github.User[]>>({});
  const [showPrioritySuggestions, setShowPrioritySuggestions] = useState(false);

  // Filtered users input state
  const [newFilteredCommentUser, setNewFilteredCommentUser] = useState("");
  const [newFilteredReviewUser, setNewFilteredReviewUser] = useState("");

  // Flag rules state
  const { rules: flagRules, loadRules: loadFlagRules, addRule, removeRule, toggleRule } = useFlagStore();
  const [newRuleType, setNewRuleType] = useState<"keyword" | "size">("keyword");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleSizeOp, setNewRuleSizeOp] = useState<"gt" | "lt" | "eq">("gt");
  const [newRuleSizeValue, setNewRuleSizeValue] = useState("");

  useEffect(() => {
    loadRepos();
    loadOrgs();
    loadFilterBots();
    loadHideStackedPRs();
    loadFilteredCommentUsers();
    loadFilteredReviewUsers();
    loadTheme();
    loadCacheTTL();
    loadPollInterval();
    loadHideDraftPRs();
    loadPRRefreshInterval();
    loadFlagRules();
    loadAiReviewPrompt();
    loadAiMaxCost();
    loadAiDescriptionPrompt();
  }, [loadRepos, loadOrgs, loadFilterBots, loadHideStackedPRs, loadHideDraftPRs, loadFilteredCommentUsers, loadFilteredReviewUsers, loadTheme, loadCacheTTL, loadPollInterval, loadPRRefreshInterval, loadFlagRules, loadAiReviewPrompt, loadAiMaxCost, loadAiDescriptionPrompt]);

  // Register vim keybindings: j/k scroll, h/l and 1-6 switch tabs.
  useEffect(() => {
    const scrollEl = document.getElementById("scroll-region");
    const tabKeys: SettingsTab[] = settingsTabs.map((t) => t.key);
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

  // Load teams and priorities for all derived orgs once repos are loaded; sync teams from GitHub if none cached yet.
  useEffect(() => {
    if (derivedOrgs.length === 0) return;
    loadAllTeams().then(() => {
      const current = useSettingsStore.getState().teamsByOrg;
      for (const org of derivedOrgs) {
        if (!current[org] || current[org].length === 0) {
          syncTeams(org);
        }
      }
    });
    loadAllPriorities();
    // Load cached org members for priority autocomplete.
    for (const org of derivedOrgs) {
      GetOrgMembers(org).then((members) => {
        setMembersByOrg((prev) => ({ ...prev, [org]: members || [] }));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedOrgs]);

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
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure authentication, filters, and preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {settingsTabs.map((tab, idx) => (
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
              {idx + 1}
            </kbd>
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
        ))}
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

            {/* Repositories Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <FolderGit2 className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Tracked Repositories</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Repositories you are tracking. Click "Add" to select a local Git repo folder.
              </p>

              <button
                onClick={() => addRepo()}
                disabled={repoLoading}
                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add repository
              </button>

              {repos.length > 0 ? (
                <ul className="space-y-2">
                  {repos.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {r.repoOwner}/{r.repoName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.localPath}
                        </p>
                      </div>
                      <button
                        onClick={() => removeRepo(r.id)}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No repositories tracked yet. Add one above to get started.
                </p>
              )}

              {/* Default repository picker */}
              {repos.length > 1 && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">Default repository</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Automatically selected when the app starts.
                      </p>
                    </div>
                    <select
                      value={selectedRepoId ?? ""}
                      onChange={(e) => {
                        const id = parseInt(e.target.value, 10);
                        if (!isNaN(id)) selectRepo(id);
                      }}
                      className="max-w-[200px] truncate rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {repos.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.repoOwner}/{r.repoName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "filters" && (
          <>
            {/* Filters Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Filters</h3>
              </div>

              <div className="rounded-lg border border-border bg-card p-3 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Filter out bot pull requests
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Hide PRs authored by Dependabot, Renovate, GitHub Actions, and
                      Snyk from all views.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={filterBots}
                    onClick={() => setFilterBots(!filterBots)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                      filterBots ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                        filterBots ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Hide stacked pull requests
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Hide PRs that target a branch other than main or master (i.e.
                      stacked/chained PRs). Can also be toggled per table.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={hideStackedPRs}
                    onClick={() => setHideStackedPRs(!hideStackedPRs)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                      hideStackedPRs ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                        hideStackedPRs ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Hide draft pull requests
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Hide PRs marked as draft. Can also be toggled per table with{" "}
                      <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">t</kbd>.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={hideDraftPRs}
                    onClick={() => setHideDraftPRs(!hideDraftPRs)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                      hideDraftPRs ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                        hideDraftPRs ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

              </div>
            </section>

            {/* Filtered Comment Users */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Filtered Comment Users</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Comments and review threads authored by these users are hidden on the
                PR detail page Discussion tab.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFilteredCommentUser}
                  onChange={(e) => setNewFilteredCommentUser(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFilteredCommentUser.trim()) {
                      const user = newFilteredCommentUser.trim();
                      if (!filteredCommentUsers.includes(user)) {
                        setFilteredCommentUsers([...filteredCommentUsers, user]);
                      }
                      setNewFilteredCommentUser("");
                    }
                  }}
                  placeholder="e.g. copilot-pull-request-reviewer[bot]"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => {
                    const user = newFilteredCommentUser.trim();
                    if (!user) return;
                    if (!filteredCommentUsers.includes(user)) {
                      setFilteredCommentUsers([...filteredCommentUsers, user]);
                    }
                    setNewFilteredCommentUser("");
                  }}
                  disabled={!newFilteredCommentUser.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              {filteredCommentUsers.length > 0 ? (
                <ul className="space-y-1">
                  {filteredCommentUsers.map((user) => (
                    <li
                      key={user}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2"
                    >
                      <span className="text-sm text-foreground">{user}</span>
                      <button
                        onClick={() =>
                          setFilteredCommentUsers(
                            filteredCommentUsers.filter((u) => u !== user),
                          )
                        }
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                  No users filtered. All comments will be shown.
                </p>
              )}
            </section>

            {/* Filtered Review Users */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Filtered Review Users</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Reviews authored by these users are hidden from the PR detail page
                Reviews section and Reviewers sidebar.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFilteredReviewUser}
                  onChange={(e) => setNewFilteredReviewUser(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFilteredReviewUser.trim()) {
                      const user = newFilteredReviewUser.trim();
                      if (!filteredReviewUsers.includes(user)) {
                        setFilteredReviewUsers([...filteredReviewUsers, user]);
                      }
                      setNewFilteredReviewUser("");
                    }
                  }}
                  placeholder="e.g. github-actions[bot]"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => {
                    const user = newFilteredReviewUser.trim();
                    if (!user) return;
                    if (!filteredReviewUsers.includes(user)) {
                      setFilteredReviewUsers([...filteredReviewUsers, user]);
                    }
                    setNewFilteredReviewUser("");
                  }}
                  disabled={!newFilteredReviewUser.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              {filteredReviewUsers.length > 0 ? (
                <ul className="space-y-1">
                  {filteredReviewUsers.map((user) => (
                    <li
                      key={user}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2"
                    >
                      <span className="text-sm text-foreground">{user}</span>
                      <button
                        onClick={() =>
                          setFilteredReviewUsers(
                            filteredReviewUsers.filter((u) => u !== user),
                          )
                        }
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                  No users filtered. All reviews will be shown.
                </p>
              )}
            </section>


          </>
        )}

        {activeTab === "teams" && (
          <>
            {/* Teams Section */}
            {isAuthenticated && derivedOrgs.length > 0 ? (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Teams</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enable the teams whose review requests you want to track. Disabled
                  teams are excluded from the poller and team review request views.
                </p>

                {derivedOrgs.map((org) => {
                  const teams = teamsByOrg[org] || [];
                  return (
                    <div key={org} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">{org}</h4>
                        <button
                          onClick={async () => {
                            setSyncingOrg(org);
                            try {
                              await syncTeams(org);
                            } finally {
                              setSyncingOrg(null);
                            }
                          }}
                          disabled={syncingOrg === org}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${syncingOrg === org ? "animate-spin" : ""}`} />
                          Sync
                        </button>
                      </div>
                      {teams.length > 0 ? (
                        <ul className="space-y-1">
                          {teams.map((team) => (
                            <li
                              key={team.teamSlug}
                              className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2"
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">{team.teamName}</p>
                                <p className="text-xs text-muted-foreground">@{org}/{team.teamSlug}</p>
                              </div>
                              <button
                                role="switch"
                                aria-checked={team.enabled}
                                onClick={() => setTeamEnabled(org, team.teamSlug, !team.enabled)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                                  team.enabled ? "bg-primary" : "bg-muted"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                                    team.enabled ? "translate-x-4" : "translate-x-0.5"
                                  }`}
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                          No teams found. Click Sync to fetch from GitHub.
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            ) : (
              <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Connect your GitHub account and add an organization to manage teams.
              </p>
            )}

            {/* Priority Reviewers Section */}
            {isAuthenticated && derivedOrgs.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Priority Reviewers</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  PRs from prioritised users or teams are surfaced first in the Review
                  Requests view and marked with a visual indicator.
                </p>

                {derivedOrgs.map((org) => {
                  const priorities = prioritiesByOrg[org] || [];
                  const existingNames = new Set(priorities.map((p) => p.name));
                  const q = newPriorityName.toLowerCase();
                  let suggestions: { name: string; label: string; avatar: string }[];
                  if (newPriorityType === "team") {
                    suggestions = (teamsByOrg[org] || [])
                      .filter((t) => !existingNames.has(t.teamSlug) && (q.length === 0 || t.teamSlug.toLowerCase().includes(q) || t.teamName.toLowerCase().includes(q)))
                      .slice(0, 10)
                      .map((t) => ({ name: t.teamSlug, label: t.teamName, avatar: "" }));
                  } else {
                    suggestions = (membersByOrg[org] || [])
                      .filter((u) => !existingNames.has(u.login) && (q.length === 0 || u.login.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q))))
                      .slice(0, 10)
                      .map((u) => ({ name: u.login, label: u.name || u.login, avatar: u.avatarUrl || "" }));
                  }
                  return (
                    <div key={org} className="space-y-2">
                      <h4 className="text-sm font-medium text-foreground">{org}</h4>

                      {/* Add form with autocomplete */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={newPriorityName}
                            onChange={(e) => {
                              setNewPriorityName(e.target.value);
                              setShowPrioritySuggestions(true);
                            }}
                            onFocus={() => setShowPrioritySuggestions(true)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newPriorityName.trim()) {
                                addPriority(org, newPriorityName.trim(), newPriorityType);
                                setNewPriorityName("");
                                setShowPrioritySuggestions(false);
                              }
                              if (e.key === "Escape") setShowPrioritySuggestions(false);
                            }}
                            placeholder={newPriorityType === "team" ? "team-slug" : "username"}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          {showPrioritySuggestions && suggestions.length > 0 && (
                            <ul className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                              {suggestions.map((s) => (
                                <li key={s.name}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      addPriority(org, s.name, newPriorityType);
                                      setNewPriorityName("");
                                      setShowPrioritySuggestions(false);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                                  >
                                    {s.avatar && (
                                      <img src={s.avatar} className="h-5 w-5 rounded-full" alt="" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm text-popover-foreground">{s.name}</p>
                                      {s.label !== s.name && (
                                        <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                                      )}
                                    </div>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setNewPriorityType((prev) => {
                              const next = prev === "user" ? "team" : "user";
                              setNewPriorityName("");
                              return next;
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          title={`Switch to ${newPriorityType === "user" ? "Team" : "User"}`}
                        >
                          {newPriorityType === "user" ? (
                            <><Users className="h-3.5 w-3.5" /> User</>
                          ) : (
                            <><Users className="h-3.5 w-3.5" /> Team</>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            if (!newPriorityName.trim()) return;
                            addPriority(org, newPriorityName.trim(), newPriorityType);
                            setNewPriorityName("");
                            setShowPrioritySuggestions(false);
                          }}
                          disabled={!newPriorityName.trim()}
                          className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </button>
                      </div>

                      {/* Priority list */}
                      {priorities.length > 0 ? (
                        <ul className="space-y-1">
                          {priorities.map((p, idx) => (
                            <li
                              key={`${p.name}-${p.type}`}
                              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                            >
                              <Star className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                              <span className="flex-1 text-sm font-medium text-foreground">
                                {p.name}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {p.type}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => movePriority(org, p.name, p.type, "up")}
                                  disabled={idx === 0}
                                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                                  title="Move up (higher priority)"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => movePriority(org, p.name, p.type, "down")}
                                  disabled={idx === priorities.length - 1}
                                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                                  title="Move down (lower priority)"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <button
                                onClick={() => removePriority(org, p.name, p.type)}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                                title="Remove"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                          No priority reviewers configured.
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}

        {activeTab === "rules" && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Flagged PR Rules</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              PRs matching enabled rules are highlighted with a red border and
              aggregated in the Flagged tab. Keywords are matched case-insensitively
              against title, body, branch, and labels. Size is additions + deletions.
            </p>

            {/* Add rule form */}
            <div className="rounded-lg border border-border bg-card p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewRuleType((prev) => {
                      const next = prev === "keyword" ? "size" : "keyword";
                      setNewRuleKeyword("");
                      setNewRuleSizeValue("");
                      return next;
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  title={`Switch to ${newRuleType === "keyword" ? "Size" : "Keyword"} rule`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {newRuleType === "keyword" ? "Keyword" : "Size"}
                </button>

                {newRuleType === "keyword" ? (
                  <input
                    type="text"
                    value={newRuleKeyword}
                    onChange={(e) => setNewRuleKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newRuleKeyword.trim()) {
                        addRule({ enabled: true, type: "keyword", keyword: newRuleKeyword.trim() });
                        setNewRuleKeyword("");
                      }
                    }}
                    placeholder="e.g. breaking, migration, security"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setNewRuleSizeOp((prev) => {
                          if (prev === "gt") return "lt";
                          if (prev === "lt") return "eq";
                          return "gt";
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      title="Click to cycle: &gt; / &lt; / ="
                    >
                      {newRuleSizeOp === "gt" ? "> greater than" : newRuleSizeOp === "lt" ? "< less than" : "= equal to"}
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={newRuleSizeValue}
                      onChange={(e) => setNewRuleSizeValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = parseInt(newRuleSizeValue, 10);
                          if (!isNaN(val) && val >= 0) {
                            addRule({ enabled: true, type: "size", sizeOp: newRuleSizeOp, sizeValue: val });
                            setNewRuleSizeValue("");
                          }
                        }
                      }}
                      placeholder="lines"
                      className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </>
                )}

                <button
                  onClick={() => {
                    if (newRuleType === "keyword") {
                      if (!newRuleKeyword.trim()) return;
                      addRule({ enabled: true, type: "keyword", keyword: newRuleKeyword.trim() });
                      setNewRuleKeyword("");
                    } else {
                      const val = parseInt(newRuleSizeValue, 10);
                      if (isNaN(val) || val < 0) return;
                      addRule({ enabled: true, type: "size", sizeOp: newRuleSizeOp, sizeValue: val });
                      setNewRuleSizeValue("");
                    }
                  }}
                  disabled={
                    newRuleType === "keyword"
                      ? !newRuleKeyword.trim()
                      : !newRuleSizeValue || isNaN(parseInt(newRuleSizeValue, 10))
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </div>

            {/* Existing rules list */}
            {flagRules.length > 0 ? (
              <ul className="space-y-1">
                {flagRules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${rule.enabled ? "text-red-500" : "text-muted-foreground/40"}`} />
                    <span className={`flex-1 text-sm font-medium ${rule.enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                      {rule.type === "keyword" ? (
                        <>keyword: <code className="rounded bg-muted px-1 py-0.5 text-xs">{rule.keyword}</code></>
                      ) : (
                        <>size {rule.sizeOp === "gt" ? ">" : rule.sizeOp === "lt" ? "<" : "="} {rule.sizeValue} lines</>
                      )}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {rule.type}
                    </span>
                    <button
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => toggleRule(rule.id)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                        rule.enabled ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                          rule.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => removeRule(rule.id)}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                      title="Remove rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                No flag rules configured. Add one above to start flagging PRs.
              </p>
            )}
          </section>
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
                          // fallback — clear to use backend default
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

              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
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
